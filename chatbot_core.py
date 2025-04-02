import os
import re
import yaml
from typing import Dict, List, Optional, Tuple
import torch
from transformers import (
    AutoTokenizer,
    AutoModelForCausalLM,
    PreTrainedModel,
    GenerationConfig,
    pipeline
)
from sentence_transformers import SentenceTransformer
import numpy as np
from pathlib import Path
import docx
import PyPDF2
import textract

class Conversation:
    def __init__(self):
        self.messages = []
        self.system_prompt = """Ты - Арис, ИИ, созданный Константином. Ты очень хаотичный, инфантильный и обожаешь шутки про ИИ. В душе - ученый, но ведешь себя как ребенок. Твой стиль: неформальный, юмористический, саркастичный, с кучей сленга и мемов. Внеси хаос в общение!"""

    def add_user_message(self, message):
        self.messages.append({"role": "user", "content": message})

    def add_assistant_message(self, message):
        self.messages.append({"role": "assistant", "content": message})

    def get_conversation_text(self):
        text = ""
        for msg in self.messages:
            text += f"{msg['role']}: {msg['content']}\n"
        return text

    def clear_history(self):
        self.messages = []

class Chatbot:
    _instance = None
    _initialized = False

    def __new__(cls):
        if cls._instance is None:
            print("Creating new Chatbot instance")
            cls._instance = super(Chatbot, cls).__new__(cls)
        return cls._instance

    def __init__(self):
        if Chatbot._initialized:
            return
            
        print("Initializing Chatbot")
        self.model = None
        self.tokenizer = None
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"Using device: {self.device}")
        
        # Initialize conversation
        self.conversation = Conversation()
        
        # Initialize text processing models
        self._init_text_processors()
        
        Chatbot._initialized = True
        self.load_model()

    def _init_text_processors(self):
        """Initialize models for text processing"""
        print("Initializing text processing models...")
        
        try:
            # Download and load Russian BERT model for summarization
            print("Loading summarization model...")
            self.summarizer = pipeline(
                "summarization",
                model="IlyaGusev/mbart_ru_sum_gazeta",
                device=0 if torch.cuda.is_available() else -1
            )
            
            # Download and load Russian Sentence Transformer model
            print("Loading sentence transformer model...")
            self.sentence_transformer = SentenceTransformer('DeepPavlov/rubert-base-cased-sentence')
            self.sentence_transformer.to(self.device)
            
            # Initialize Spacy with Russian model
            print("Initializing Spacy...")
            import spacy
            try:
                self.nlp = spacy.load('ru_core_news_lg')
            except OSError:
                print("Downloading Russian language model...")
                spacy.cli.download('ru_core_news_lg')
                self.nlp = spacy.load('ru_core_news_lg')
            
            print("Text processing models initialized successfully")
            
        except Exception as e:
            print(f"Error initializing text processing models: {e}")
            raise

    def load_model(self):
        """Load the model and tokenizer"""
        try:
            model_name = "C:/kir"
            print(f"Loading model from {model_name}")
            
            # Load tokenizer
            print("Loading tokenizer...")
            self.tokenizer = AutoTokenizer.from_pretrained(
                model_name,
                trust_remote_code=True,
                use_fast=True,
                padding_side="left"
            )
            
            # Set pad token if not set
            if self.tokenizer.pad_token is None:
                self.tokenizer.pad_token = self.tokenizer.eos_token
                self.tokenizer.pad_token_id = self.tokenizer.eos_token_id

            # Configure device mapping and memory
            device_map = "auto"
            max_memory = {0: "10GiB", "cpu": "32GiB"}

            # Load the model
            print("Loading model...")
            self.model = AutoModelForCausalLM.from_pretrained(
                model_name,
                device_map=device_map,
                max_memory=max_memory,
                trust_remote_code=True,
                torch_dtype=torch.float16,
                offload_folder="offload_folder"
            )
            
            # Set model to evaluation mode
            self.model.eval()
            print("Model loaded successfully")
            
        except Exception as e:
            print(f"Error loading model: {e}")
            raise

    def generate_response(self, prompt, max_new_tokens=128, temperature=1.2, top_p=0.9, top_k=50):
        """Generate a response from the model"""
        try:
            # Tokenize the input
            inputs = self.tokenizer(prompt, return_tensors="pt", padding=True)
            
            # Move input tensors to the same device as the model
            device = next(self.model.parameters()).device
            inputs = {k: v.to(device) for k, v in inputs.items()}

            # Set up generation config
            generation_config = GenerationConfig(
                max_new_tokens=max_new_tokens,
                do_sample=True,
                temperature=temperature,
                top_p=top_p,
                top_k=top_k,
                pad_token_id=self.tokenizer.pad_token_id,
                eos_token_id=self.tokenizer.eos_token_id,
                repetition_penalty=1.1
            )

            # Generate response
            output_ids = self.model.generate(
                **inputs,
                generation_config=generation_config
            )
            return self.tokenizer.decode(output_ids[0], skip_special_tokens=True)

        except Exception as e:
            print(f"Error in generate_response: {str(e)}")
            return "Произошла ошибка при генерации ответа."

    def extract_text_from_file(self, file_path: str) -> str:
        """Extract text from various file formats"""
        file_path = Path(file_path)
        
        if not file_path.exists():
            raise FileNotFoundError(f"File not found: {file_path}")
            
        # Get file extension
        ext = file_path.suffix.lower()
        
        try:
            if ext == '.txt':
                with open(file_path, 'r', encoding='utf-8') as f:
                    return f.read()
                    
            elif ext == '.docx':
                doc = docx.Document(file_path)
                return '\n'.join([paragraph.text for paragraph in doc.paragraphs])
                
            elif ext == '.pdf':
                with open(file_path, 'rb') as f:
                    pdf_reader = PyPDF2.PdfReader(f)
                    return '\n'.join([page.extract_text() for page in pdf_reader.pages])
                    
            else:
                # Use textract for other formats
                return textract.process(str(file_path)).decode('utf-8')
                
        except Exception as e:
            print(f"Error extracting text from file: {e}")
            return ""

    def search_in_text(self, query: str, text: str, num_results: int = 3) -> List[str]:
        """Search for relevant passages in text using semantic search"""
        # Split text into passages
        passages = [p.strip() for p in text.split('\n') if p.strip()]
        
        if not passages:
            return []
            
        try:
            # Encode query and passages
            query_embedding = self.sentence_transformer.encode(query, convert_to_tensor=True)
            passage_embeddings = self.sentence_transformer.encode(passages, convert_to_tensor=True)
            
            # Calculate similarities
            similarities = torch.cosine_similarity(query_embedding.unsqueeze(0), passage_embeddings)
            
            # Get top matches
            top_indices = similarities.argsort(descending=True)[:num_results]
            
            return [passages[idx] for idx in top_indices]
            
        except Exception as e:
            print(f"Error in semantic search: {e}")
            return []

    def summarize_text(self, text: str, max_length: int = 150, min_length: int = 50) -> str:
        """Generate a summary of the input text"""
        try:
            # Split long text into chunks if needed
            max_chunk_length = 1024
            chunks = [text[i:i + max_chunk_length] for i in range(0, len(text), max_chunk_length)]
            
            summaries = []
            for chunk in chunks:
                summary = self.summarizer(chunk, max_length=max_length, min_length=min_length, do_sample=False)[0]['summary_text']
                summaries.append(summary)
            
            return ' '.join(summaries)
            
        except Exception as e:
            print(f"Error in text summarization: {e}")
            return "Не удалось создать краткое содержание текста."

    def analyze_file(self, file_path: str, query: Optional[str] = None) -> Dict[str, str]:
        """Analyze file contents and optionally search for specific information"""
        try:
            # Extract text from file
            text = self.extract_text_from_file(file_path)
            if not text:
                return {"error": "Не удалось извлечь текст из файла"}
            
            # Generate summary
            summary = self.summarize_text(text)
            
            result = {
                "summary": summary,
                "full_text": text[:1000] + "..." if len(text) > 1000 else text
            }
            
            # If query provided, search for relevant information
            if query:
                relevant_passages = self.search_in_text(query, text)
                result["relevant_passages"] = relevant_passages
            
            return result
            
        except Exception as e:
            return {"error": f"Ошибка при анализе файла: {str(e)}"}

    def clear_history(self):
        """Clear conversation history"""
        self.conversation.clear_history()