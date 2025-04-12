import os
import json
import logging
import psutil
import torch
from fastapi import FastAPI, UploadFile, File, Form, WebSocket, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import HTMLResponse, FileResponse, JSONResponse, RedirectResponse
from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton, WebAppInfo
from telegram.ext import Application, CommandHandler, MessageHandler, filters
from chatbot_core import Chatbot
from typing import Optional
from PyQt6.QtWidgets import (QApplication, QMainWindow, QWidget, QVBoxLayout, 
                           QHBoxLayout, QPushButton, QTextEdit, QLabel, 
                           QScrollArea, QFrame, QSplitter, QDialog, QGroupBox, QLineEdit, QTextBrowser, QComboBox)
from PyQt6.QtCore import Qt, QThread, pyqtSignal, QSize, QSettings
from PyQt6.QtGui import QIcon, QFont, QPalette, QColor
import sys
import asyncio
import threading
import time
import base64
from datetime import datetime
from voice_input import VoiceInput
from text_to_speech import TextToSpeech
from fastapi import WebSocket
from fastapi.responses import JSONResponse
import httpx

# Initialize FastAPI app
app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене замените на конкретные домены
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize chatbot
chatbot = Chatbot()

class ChatApp:
    def __init__(self):
        self.chatbot = chatbot
        self.voice_input = VoiceInput()
        self.tts = TextToSpeech()
        self.voice_enabled = False
        self.connections = set()
    
    def toggle_voice(self):
        """Toggle voice input on/off"""
        if self.voice_enabled:
            print("Останавливаю запись...")
            self.voice_input.stop_recording()
            self.voice_enabled = False
        else:
            print("Начинаю запись...")
            self.voice_input.start_recording()
            self.voice_enabled = True
    
    async def broadcast_message(self, message: str, msg_type: str = "message", audio_path: str = None):
        """Send message to all connected clients"""
        data = {
            "type": msg_type,
            "message": message
        }
        
        if audio_path and os.path.exists(audio_path):
            try:
                with open(audio_path, "rb") as audio_file:
                    audio_bytes = audio_file.read()
                    audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
                    data["audio"] = audio_base64
            except Exception as e:
                print(f"Ошибка кодирования аудио: {str(e)}")
        
        for websocket in self.connections:
            try:
                await websocket.send_json(data)
            except Exception as e:
                print(f"Ошибка отправки сообщения: {str(e)}")
    
    async def handle_voice_input(self):
        """Handle voice input in background"""
        while True:
            text = self.voice_input.get_recognized_text()
            if text is not None:
                if text:
                    print(f"Распознанное голосовое сообщение: {text}")
                    await self.broadcast_message(text, "voice_message")
                    response = self.chatbot.generate_response(text)
                    print(f"Ответ ассистента: {response}")
                    audio_path = await self.tts.generate_speech(response)
                    await self.broadcast_message(response, "message", audio_path)
                    self.tts.cleanup_file(audio_path)
            await asyncio.sleep(0.1)

    async def handle_websocket(self, websocket: WebSocket):
        await websocket.accept()
        self.connections.add(websocket)
        try:
            while True:
                data = await websocket.receive_json()
                
                if data["type"] == "message":
                    text = data["content"]
                    response = self.chatbot.generate_response(text)
                    await self.broadcast_message(response, "response")
                    
                elif data["type"] == "voice":
                    # Handle voice message
                    audio_data = base64.b64decode(data["audio"])
                    text = self.voice_input.transcribe(audio_data)
                    response = self.chatbot.generate_response(text)
                    audio_path = self.tts.generate(response)
                    await self.broadcast_message(response, "response", audio_path)
                    
                elif data["type"] == "reload_model":
                    # Handle model reload with new quantization
                    quantization = data.get("quantization", "none")
                    print(f"Reloading model with quantization: {quantization}")
                    
                    # Recreate chatbot with new quantization
                    self.chatbot = Chatbot(quantization_mode=quantization)
                    
                    # Notify clients about successful reload
                    await self.broadcast_message(
                        "Модель успешно перезагружена с новыми настройками квантования", 
                        "system"
                    )
                    
                elif data["type"] == "new_session":
                    # Clear chatbot history
                    self.chatbot.clear_history()
                    await self.broadcast_message("История чата очищена", "system")
                    
        except WebSocketDisconnect:
            self.connections.remove(websocket)
        except Exception as e:
            print(f"Error in websocket handler: {str(e)}")
            try:
                await websocket.close()
            except:
                pass
            self.connections.remove(websocket)

class MessageWidget(QFrame):
    def __init__(self, text, is_user=False, parent=None, context=None, facts=None):
        try:
            if parent and not parent.isVisible():
                return None
            super().__init__(parent)
            self.setFrameStyle(QFrame.Shape.NoFrame)
            
            # Main layout with proper spacing
            main_layout = QHBoxLayout()
            main_layout.setContentsMargins(20, 4, 20, 4)
            main_layout.setSpacing(16)
            self.setLayout(main_layout)
            
            # Avatar with gradient
            avatar_label = QLabel("👤" if is_user else "🤖")
            avatar_label.setFixedSize(40, 40)
            avatar_label.setStyleSheet(f"""
                QLabel {{
                    background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                        stop:0 {'#ff6b6b' if is_user else '#8B0000'},
                        stop:1 {'#cc0000' if is_user else '#4a0000'});
                    color: white;
                    border-radius: 20px;
                    font-size: 20px;
                    qproperty-alignment: AlignCenter;
                    border: 2px solid {'#ff8585' if is_user else '#a31515'};
                }}
            """)
            
            # Message content container
            content_widget = QWidget()
            content_widget.setFixedWidth(600)
            content_layout = QVBoxLayout()
            content_layout.setContentsMargins(0, 0, 0, 0)
            content_layout.setSpacing(4)
            content_widget.setLayout(content_layout)
            
            # Header with name and timestamp
            header_widget = QWidget()
            header_layout = QHBoxLayout()
            header_layout.setContentsMargins(0, 0, 0, 0)
            header_layout.setSpacing(8)
            header_widget.setLayout(header_layout)
            
            # Username
            username = QLabel("Вы" if is_user else "Арис")
            username.setStyleSheet(f"""
                QLabel {{
                    color: {'#ff4444' if is_user else '#ff0000'};
                    font-weight: bold;
                    font-size: 16px;
                    font-family: 'Segoe UI', Arial;
                }}
            """)
            
            # Timestamp
            current_time = datetime.now().strftime("%H:%M")
            time_label = QLabel(current_time)
            time_label.setStyleSheet("""
                QLabel {
                    color: #999999;
                    font-size: 13px;
                    font-family: 'Segoe UI', Arial;
                    font-weight: 500;
                }
            """)
            
            header_layout.addWidget(username)
            header_layout.addWidget(time_label)
            header_layout.addStretch()
            
            # Message text with proper wrapping
            message = QLabel(text)
            message.setWordWrap(True)
            message.setTextFormat(Qt.TextFormat.PlainText)
            message.setStyleSheet("""
                QLabel {
                    color: #ffffff;
                    font-size: 15px;
                    font-family: 'Segoe UI', Arial;
                    line-height: 1.4;
                    padding: 4px 0;
                    background: transparent;
                }
            """)
            
            # Add playback button for bot messages
            if not is_user:
                playback_button = QPushButton()
                playback_button.setFixedSize(30, 30)
                playback_button.setCheckable(True)
                playback_button.setStyleSheet("""
                    QPushButton {
                        background: transparent;
                        border: none;
                        border-radius: 15px;
                        color: #cccccc;
                        font-size: 16px;
                    }
                    QPushButton:hover {
                        background: rgba(255, 255, 255, 0.1);
                    }
                    QPushButton:checked {
                        background: rgba(139, 0, 0, 0.5);
                    }
                    QPushButton:disabled {
                        color: #666666;
                    }
                """)
                playback_button.setText("▶️")
                playback_button.clicked.connect(lambda: self.toggle_playback(text, playback_button))
                header_layout.addWidget(playback_button)
            
            content_layout.addWidget(header_widget)
            content_layout.addWidget(message)
            
            # Add context and facts if available (for bot messages)
            if not is_user and (context or facts):
                details_button = QPushButton("ℹ️ Подробности")
                details_button.setStyleSheet("""
                    QPushButton {
                        background: transparent;
                        border: none;
                        color: #999999;
                        font-size: 13px;
                        text-align: left;
                        padding: 4px;
                    }
                    QPushButton:hover {
                        color: white;
                    }
                """)
                details_button.clicked.connect(lambda: self.show_details(context, facts))
                content_layout.addWidget(details_button)
            
            # Add hover effect container
            hover_container = QFrame()
            hover_container.setLayout(QHBoxLayout())
            hover_container.layout().addWidget(content_widget)
            hover_container.layout().setContentsMargins(0, 0, 0, 0)
            hover_container.setStyleSheet("""
                QFrame {
                    border-radius: 8px;
                    padding: 4px;
                    background: transparent;
                }
                QFrame:hover {
                    background-color: rgba(255, 255, 255, 0.05);
                }
            """)
            
            main_layout.addWidget(avatar_label, alignment=Qt.AlignmentFlag.AlignTop)
            main_layout.addWidget(hover_container, stretch=1)
            main_layout.addStretch()
            
        except Exception as e:
            print(f"Error creating MessageWidget: {e}")
            return None
    
    def toggle_playback(self, text, button):
        if button.isChecked():
            button.setText("⏸️")
            # Start TTS playback
            window = self.window()
            if hasattr(window, 'chat_app'):
                window.chat_app.tts.speak(text)
        else:
            button.setText("▶️")
            # Stop TTS playback
            window = self.window()
            if hasattr(window, 'chat_app'):
                window.chat_app.tts.stop()
                
    def show_details(self, context, facts):
        dialog = QDialog(self)
        dialog.setWindowTitle("Подробности генерации")
        dialog.setMinimumWidth(500)
        dialog.setStyleSheet("""
            QDialog {
                background: #1a1a1a;
            }
            QLabel {
                color: white;
                font-family: 'Segoe UI', Arial;
            }
            QTextBrowser {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: white;
                padding: 8px;
                font-family: 'Segoe UI', Arial;
            }
        """)
        
        layout = QVBoxLayout(dialog)
        
        if context:
            context_label = QLabel("Использованный контекст:")
            context_text = QTextBrowser()
            context_text.setText(context)
            layout.addWidget(context_label)
            layout.addWidget(context_text)
            
        if facts:
            facts_label = QLabel("Использованные факты:")
            facts_text = QTextBrowser()
            facts_text.setText("\n".join(f"• {fact}" for fact in facts))
            layout.addWidget(facts_label)
            layout.addWidget(facts_text)
            
        close_button = QPushButton("Закрыть")
        close_button.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.1);
                border: none;
                border-radius: 6px;
                color: white;
                padding: 8px 16px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.15);
            }
        """)
        close_button.clicked.connect(dialog.accept)
        layout.addWidget(close_button)
        
        dialog.exec()

class SettingsDialog(QDialog):
    def __init__(self, parent=None):
        super().__init__(parent)
        self.setWindowTitle("Настройки")
        self.setMinimumWidth(500)
        self.setStyleSheet("""
            QDialog {
                background: #1a1a1a;
            }
            QLabel {
                color: white;
                font-family: 'Segoe UI', Arial;
                font-size: 14px;
            }
            QLineEdit, QTextEdit, QComboBox {
                background: rgba(255, 255, 255, 0.05);
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 6px;
                color: white;
                padding: 8px;
                font-family: 'Segoe UI', Arial;
                font-size: 14px;
            }
            QLineEdit:focus, QTextEdit:focus, QComboBox:focus {
                border: 1px solid #8B0000;
            }
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #8B0000,
                    stop:1 #4a0000);
                color: white;
                border: none;
                border-radius: 6px;
                padding: 8px 16px;
                font-family: 'Segoe UI', Arial;
                font-size: 14px;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #a31515,
                    stop:1 #600000);
            }
            QPushButton:pressed {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #700000,
                    stop:1 #300000);
            }
            QGroupBox {
                color: white;
                font-weight: bold;
                font-family: 'Segoe UI', Arial;
                font-size: 15px;
                border: 1px solid rgba(255, 255, 255, 0.1);
                border-radius: 8px;
                padding: 16px;
                margin-top: 8px;
            }
            QGroupBox::title {
                subcontrol-origin: margin;
                left: 8px;
                padding: 0 4px;
            }
            QComboBox::drop-down {
                border: none;
                width: 20px;
            }
            QComboBox::down-arrow {
                image: url(down_arrow.png);
                width: 12px;
                height: 12px;
            }
            QComboBox QAbstractItemView {
                background: #2d2d2d;
                border: 1px solid rgba(255, 255, 255, 0.1);
                selection-background-color: #8B0000;
                selection-color: white;
            }
        """)

        layout = QVBoxLayout(self)
        layout.setSpacing(16)
        layout.setContentsMargins(24, 24, 24, 24)

        # 1. Text Generation Model
        model_group = QGroupBox("Модель генерации текста")
        model_layout = QVBoxLayout(model_group)
        
        model_label = QLabel("Hugging Face модель:")
        self.model_input = QLineEdit()
        self.model_input.setPlaceholderText("inkoziev/rugpt_chitchat")
        model_layout.addWidget(model_label)
        model_layout.addWidget(self.model_input)

        # 2. Search Model
        search_group = QGroupBox("Модель поиска")
        search_layout = QVBoxLayout(search_group)
        
        search_label = QLabel("Hugging Face модель для поиска:")
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("inkoziev/sbert_pq")
        search_layout.addWidget(search_label)
        search_layout.addWidget(self.search_input)

        # 3. Add Information
        info_group = QGroupBox("Добавить информацию")
        info_layout = QVBoxLayout(info_group)
        
        info_label = QLabel("Добавить фразу в базу данных:")
        self.info_input = QTextEdit()
        self.info_input.setPlaceholderText("Введите текст для добавления в базу данных...")
        self.info_input.setMaximumHeight(100)
        info_layout.addWidget(info_label)
        info_layout.addWidget(self.info_input)

        # Buttons
        button_layout = QHBoxLayout()
        save_button = QPushButton("Сохранить")
        cancel_button = QPushButton("Отмена")
        cancel_button.setStyleSheet("""
            QPushButton {
                background: rgba(255, 255, 255, 0.1);
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.15);
            }
            QPushButton:pressed {
                background: rgba(255, 255, 255, 0.2);
            }
        """)
        
        button_layout.addWidget(cancel_button)
        button_layout.addWidget(save_button)

        # Connect buttons
        save_button.clicked.connect(self.accept)
        cancel_button.clicked.connect(self.reject)

        # Add all to main layout
        layout.addWidget(model_group)
        layout.addWidget(search_group)
        layout.addWidget(info_group)
        layout.addLayout(button_layout)

        # Load current settings
        self.load_current_settings()

    def load_current_settings(self):
        settings = QSettings()
        self.model_input.setText(settings.value("model", "inkoziev/rugpt_chitchat"))
        self.search_input.setText(settings.value("search_model", "inkoziev/sbert_pq"))
        
    def get_settings(self):
        settings = QSettings()
        
        # Get values
        model = self.model_input.text()
        search_model = self.search_input.text()
        info = self.info_input.toPlainText()
        
        # Save to QSettings
        if model:
            settings.setValue("model", model)
        if search_model:
            settings.setValue("search_model", search_model)
        
        return {
            'model': model,
            'search_model': search_model,
            'info': info,
        }

class DesktopChatWindow(QMainWindow):
    def __init__(self, chat_app):
        super().__init__()
        self.chat_app = chat_app
        self.setWindowTitle("Арис")
        self.setMinimumSize(900, 600)
        
        # Set window background with gradient
        self.setStyleSheet("""
            QMainWindow {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #1a1a1a,
                    stop:1 #2d2d2d);
            }
        """)
        
        main_widget = QWidget()
        self.setCentralWidget(main_widget)
        layout = QHBoxLayout(main_widget)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(0)
        
        # Elegant sidebar
        sidebar = QWidget()
        sidebar.setFixedWidth(260)
        sidebar.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #1a1a1a,
                    stop:1 #2a2a2a);
                border-right: 1px solid #333333;
            }
        """)
        
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(0, 0, 0, 0)
        sidebar_layout.setSpacing(0)
        
        # Elegant server header
        server_header = QWidget()
        server_header.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #8B0000,
                    stop:1 #4a0000);
                min-height: 56px;
                border-bottom: 1px solid #333333;
            }
        """)
        server_header_layout = QHBoxLayout(server_header)
        server_header_layout.setContentsMargins(20, 0, 20, 0)
        
        server_name = QLabel("Арис")
        server_name.setStyleSheet("""
            QLabel {
                color: white;
                font-weight: bold;
                font-size: 18px;
                font-family: 'Segoe UI', Arial;
            }
        """)
        server_header_layout.addWidget(server_name)
        
        sidebar_layout.addWidget(server_header)
        
        # Channel list with beautiful styling
        channels_widget = QWidget()
        channels_layout = QVBoxLayout(channels_widget)
        channels_layout.setContentsMargins(8, 16, 8, 0)
        channels_layout.setSpacing(4)
        
        # Channel category with elegant design
        category_label = QLabel("ДИАЛОГ")
        category_label.setStyleSheet("""
            QLabel {
                color: #cccccc;
                font-size: 13px;
                font-weight: bold;
                font-family: 'Segoe UI', Arial;
                padding: 8px 12px;
            }
        """)
        channels_layout.addWidget(category_label)
        
        # Active channel button with beautiful gradient
        channel_button = QPushButton("💬  Общий чат")
        channel_button.setStyleSheet("""
            QPushButton {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #8B0000,
                    stop:1 #4a0000);
                color: white;
                border: none;
                border-radius: 8px;
                padding: 12px;
                text-align: left;
                font-family: 'Segoe UI', Arial;
                font-size: 15px;
                font-weight: 500;
            }
            QPushButton:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #a31515,
                    stop:1 #600000);
            }
        """)
        channels_layout.addWidget(channel_button)

        # Settings button
        settings_button = QPushButton("⚙️  Настройки")
        settings_button.setStyleSheet("""
            QPushButton {
                background: transparent;
                color: #cccccc;
                border: none;
                border-radius: 8px;
                padding: 12px;
                text-align: left;
                font-family: 'Segoe UI', Arial;
                font-size: 15px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.05);
                color: white;
            }
        """)
        settings_button.clicked.connect(self.show_settings)
        channels_layout.addWidget(settings_button)
        channels_layout.addStretch()
        
        sidebar_layout.addWidget(channels_widget)
        
        # Elegant user panel
        user_panel = QWidget()
        user_panel.setFixedHeight(70)
        user_panel.setStyleSheet("""
            QWidget {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #1a1a1a,
                    stop:1 #2a2a2a);
                border-top: 1px solid #333333;
            }
        """)
        user_panel_layout = QHBoxLayout(user_panel)
        user_panel_layout.setContentsMargins(16, 12, 16, 12)
        
        # User avatar with gradient
        user_avatar = QLabel("👤")
        user_avatar.setFixedSize(40, 40)
        user_avatar.setStyleSheet("""
            QLabel {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:1,
                    stop:0 #8B0000,
                    stop:1 #4a0000);
                color: white;
                border-radius: 20px;
                font-size: 20px;
                qproperty-alignment: AlignCenter;
                border: 2px solid #a31515;
            }
        """)
        
        # User info with elegant text
        user_info = QLabel("Пользователь")
        user_info.setStyleSheet("""
            QLabel {
                color: white;
                font-family: 'Segoe UI', Arial;
                font-size: 15px;
                font-weight: bold;
            }
        """)
        
        user_panel_layout.addWidget(user_avatar)
        user_panel_layout.addWidget(user_info)
        user_panel_layout.addStretch()
        
        sidebar_layout.addWidget(user_panel)
        
        # Chat area with elegant styling
        chat_widget = QWidget()
        chat_layout = QVBoxLayout(chat_widget)
        chat_layout.setContentsMargins(0, 0, 0, 0)
        chat_layout.setSpacing(0)
        
        # Beautiful channel header
        channel_header = QWidget()
        channel_header.setFixedHeight(60)
        channel_header.setStyleSheet("""
            QWidget {
                background: rgba(26, 26, 26, 0.95);
                border-bottom: 1px solid #333333;
            }
        """)
        channel_header_layout = QHBoxLayout(channel_header)
        channel_header_layout.setContentsMargins(24, 0, 24, 0)
        
        channel_name = QLabel("💬  Общий чат")
        channel_name.setStyleSheet("""
            QLabel {
                color: white;
                font-weight: bold;
                font-size: 18px;
                font-family: 'Segoe UI', Arial;
            }
        """)
        channel_header_layout.addWidget(channel_name)
        
        chat_layout.addWidget(channel_header)
        
        # Messages area with beautiful scrollbar
        self.messages_area = QScrollArea()
        self.messages_area.setWidgetResizable(True)
        self.messages_area.setHorizontalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAlwaysOff)
        self.messages_area.setStyleSheet("""
            QScrollArea {
                border: none;
                background: transparent;
            }
            QScrollBar:vertical {
                border: none;
                background: rgba(255, 255, 255, 0.05);
                width: 10px;
                margin: 0;
            }
            QScrollBar::handle:vertical {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #8B0000,
                    stop:1 #4a0000);
                min-height: 40px;
                border-radius: 5px;
            }
            QScrollBar::handle:vertical:hover {
                background: qlineargradient(x1:0, y1:0, x2:1, y2:0,
                    stop:0 #a31515,
                    stop:1 #600000);
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0;
            }
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
                background: none;
            }
        """)
        
        self.messages_widget = QWidget()
        self.messages_widget.setStyleSheet("background: transparent;")
        self.messages_layout = QVBoxLayout(self.messages_widget)
        self.messages_layout.addStretch()
        self.messages_area.setWidget(self.messages_widget)
        
        chat_layout.addWidget(self.messages_area)
        
        # Input container with dynamic height
        input_container = QWidget()
        input_container.setStyleSheet("""
            QWidget {
                background: rgba(255, 255, 255, 0.05);
                border-radius: 12px;
                border: 1px solid rgba(255, 255, 255, 0.1);
            }
        """)
        input_container_layout = QHBoxLayout(input_container)
        input_container_layout.setContentsMargins(20, 0, 20, 0)
        input_container_layout.setSpacing(16)
        
        # Beautiful button styling
        button_style = """
            QPushButton {
                background: transparent;
                border: none;
                border-radius: 8px;
                padding: 8px;
                color: #cccccc;
                font-size: 20px;
            }
            QPushButton:hover {
                background: rgba(255, 255, 255, 0.1);
                color: white;
            }
            QPushButton:pressed {
                background: rgba(255, 255, 255, 0.15);
            }
            QPushButton:checked {
                background: rgba(139, 0, 0, 0.5);
                color: white;
            }
            QPushButton:disabled {
                color: #666666;
            }
        """
        
        # Send message button
        self.send_button = QPushButton("📨")
        self.send_button.setFixedSize(40, 40)
        self.send_button.setStyleSheet(button_style)
        self.send_button.clicked.connect(self.send_message)
        self.send_button.setToolTip("Отправить сообщение")
        
        # Voice recording button
        self.voice_button = QPushButton("🎙️")
        self.voice_button.setFixedSize(40, 40)
        self.voice_button.setStyleSheet(button_style)
        self.voice_button.setCheckable(True)
        self.voice_button.clicked.connect(self.toggle_voice)
        self.voice_button.setToolTip("Записать голосовое сообщение")
        
        # Play/Pause TTS button
        self.play_button = QPushButton("▶️")
        self.play_button.setFixedSize(40, 40)
        self.play_button.setStyleSheet(button_style)
        self.play_button.setCheckable(True)
        self.play_button.clicked.connect(self.toggle_playback)
        self.play_button.setEnabled(False)  # Disabled until we have a message to play
        self.play_button.setToolTip("Воспроизвести/остановить озвучку")
        
        # Create a text edit with dynamic height
        self.message_input = QTextEdit()
        self.message_input.setPlaceholderText("Написать сообщение...")
        self.message_input.setMinimumHeight(44)  # Initial height
        self.message_input.setMaximumHeight(200)  # Maximum height (about 6-8 lines)
        self.message_input.setVerticalScrollBarPolicy(Qt.ScrollBarPolicy.ScrollBarAsNeeded)
        self.message_input.setStyleSheet("""
            QTextEdit {
                background: transparent;
                border: none;
                color: white;
                font-size: 15px;
                font-family: 'Segoe UI', Arial;
                padding: 12px 0;
            }
            QTextEdit:focus {
                border: none;
                outline: none;
            }
            QScrollBar:vertical {
                border: none;
                background: rgba(255, 255, 255, 0.05);
                width: 8px;
                margin: 0;
            }
            QScrollBar::handle:vertical {
                background: rgba(255, 255, 255, 0.2);
                min-height: 20px;
                border-radius: 4px;
            }
            QScrollBar::handle:vertical:hover {
                background: rgba(255, 255, 255, 0.3);
            }
            QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical {
                height: 0;
            }
            QScrollBar::add-page:vertical, QScrollBar::sub-page:vertical {
                background: none;
            }
        """)
        self.message_input.textChanged.connect(self.adjust_input_height)
        self.message_input.installEventFilter(self)
        
        input_container_layout.addWidget(self.message_input)
        input_container_layout.addWidget(self.send_button)
        input_container_layout.addWidget(self.voice_button)
        input_container_layout.addWidget(self.play_button)
        
        chat_layout.addWidget(input_container)
        
        layout.addWidget(sidebar)
        layout.addWidget(chat_widget)
    
    def eventFilter(self, obj, event):
        if obj is self.message_input and event.type() == event.Type.KeyPress:
            if event.key() == Qt.Key.Key_Return and not event.modifiers() & Qt.KeyboardModifier.ShiftModifier:
                self.send_message()
                return True
        return super().eventFilter(obj, event)
    
    def add_message(self, text, is_user=False, context=None, facts=None):
        try:
            if not self.isVisible():
                return
                
            message_widget = MessageWidget(text, is_user, parent=self, context=context, facts=facts)
            self.messages_layout.insertWidget(self.messages_layout.count() - 1, message_widget)
            
            # Scroll to bottom
            self.messages_area.verticalScrollBar().setValue(
                self.messages_area.verticalScrollBar().maximum()
            )
            
            # Process events to prevent UI freeze
            QApplication.processEvents()
            
        except Exception as e:
            print(f"Error adding message: {e}")
            
    def send_message(self):
        try:
            if not self.isVisible():
                return
                
            text = self.message_input.toPlainText().strip()
            if not text:
                return
                
            # Clear input field
            self.message_input.clear()
            
            # Add user message
            self.add_message(text, True)
            
            try:
                # Get response from chatbot
                response = self.chat_app.chatbot.generate_response(text)
                if response and self.isVisible():
                    self.add_message(response, False)
            except Exception as e:
                print(f"Error generating response: {e}")
                if self.isVisible():
                    self.add_message("Извините, произошла ошибка. Попробуйте еще раз.", False)
            
        except Exception as e:
            print(f"Error in send_message: {e}")
    
    def toggle_playback(self):
        """Toggle text-to-speech playback"""
        if self.play_button.isChecked():
            self.play_button.setText("⏸️")
            self.chat_app.tts.resume()
        else:
            self.play_button.setText("▶️")
            self.chat_app.tts.pause()

    def toggle_voice(self):
        """Toggle voice input recording"""
        if self.voice_button.isChecked():
            print("Начинаю запись...")
            self.chat_app.voice_input.start_recording()
            self.voice_button.setText("⏹️")
            self.send_button.setEnabled(False)
            self.play_button.setEnabled(False)
        else:
            print("Останавливаю запись...")
            self.chat_app.voice_input.stop_recording()
            self.voice_button.setText("🎙️")
            self.send_button.setEnabled(True)
            self.play_button.setEnabled(True)

    def show_settings(self):
        dialog = SettingsDialog(self)
        if dialog.exec() == QDialog.DialogCode.Accepted:
            settings = dialog.get_settings()
            changes_made = False
            reload_needed = False
            
            # Check for model changes
            if settings['model']:
                changes_made = True
                reload_needed = True
                self.add_message(f"Модель генерации текста изменена на: {settings['model']}", False)
            
            # Check for search model changes
            if settings['search_model']:
                changes_made = True
                reload_needed = True
                self.add_message(f"Модель поиска изменена на: {settings['search_model']}", False)
            
            # Check for new information
            if settings['info']:
                changes_made = True
                self.add_message(f"Добавлена информация в базу данных: {settings['info']}", False)
            
            # If changes require model reload, notify the user and trigger reload
            if reload_needed:
                self.add_message(
                    "Применение новых настроек... Это может занять некоторое время.", 
                    False
                )
                
                # Send reload request through WebSocket
                asyncio.create_task(self.chat_app.broadcast_message({
                    "type": "reload_model",
                    "quantization": "none"
                }))
            
            elif not changes_made:
                self.add_message("Настройки не были изменены.", False)

    def show_about(self):
        about_text = """
        Арис
        Версия: 1.0.0
        
        Создатель: Константин
        
        Возможности:
        - Общение на естественном языке
        - Голосовое управление
        - Синтез речи
        - Обработка команд
        - Машинное обучение
        
        2024 Все права защищены
        """
        self.add_message(about_text, False)
    
    def adjust_input_height(self):
        # Calculate required height based on content
        document = self.message_input.document()
        document_height = int(document.size().height())  # Convert to integer
        margins = self.message_input.contentsMargins()
        height = int(document_height + margins.top() + margins.bottom() + 24)  # Convert final result to integer
        
        # Clamp height between min and max
        height = max(44, min(height, 200))
        
        # Set the new height
        self.message_input.setFixedHeight(height)

chat_app = ChatApp()

@app.get("/")
async def get_index():
    return FileResponse("static/index.html")

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    chat_app.connections.add(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "message":
                text = data["content"]
                response = chat_app.chatbot.generate_response(text)
                await chat_app.broadcast_message(response, "response")
                
            elif data["type"] == "voice":
                # Handle voice message
                audio_data = base64.b64decode(data["audio"])
                text = chat_app.voice_input.transcribe(audio_data)
                response = chat_app.chatbot.generate_response(text)
                audio_path = chat_app.tts.generate(response)
                await chat_app.broadcast_message(response, "response", audio_path)
                
            elif data["type"] == "reload_model":
                # Get quantization mode
                quantization = data.get("quantization", "none")
                
                # Reload chatbot with new quantization
                chat_app.chatbot = Chatbot(quantization_mode=quantization)
                
                # Send confirmation
                await chat_app.broadcast_message("Модель успешно перезагружена", "system")
                
            elif data["type"] == "new_session":
                # Clear chatbot history
                chat_app.chatbot.clear_history()
                await chat_app.broadcast_message("История чата очищена", "system")
                
    except WebSocketDisconnect:
        chat_app.connections.remove(websocket)

def find_free_port():
    """Найти свободный порт"""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(('', 0))
        s.listen(1)
        port = s.getsockname()[1]
    return port

@app.on_event("startup")
async def startup_event():
    """Действия при запуске приложения"""
    try:
        # Получаем системную информацию
        cpu_percent = psutil.cpu_percent()
        memory = psutil.virtual_memory()
        gpu_info = ""
        if torch.cuda.is_available():
            gpu_info = f"\n  - Модель: {torch.cuda.get_device_name(0)}\n  - Память: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB"
        
        print("\n==================================================")
        print("🤖 Запуск Ариса...")
        print("==================================================\n")
        print("📊 Состояние системы:")
        print(f"• CPU: {cpu_percent}% загружен")
        print(f"• RAM: {memory.percent}% использовано")
        print(f"• GPU: {'Доступна' if torch.cuda.is_available() else 'Недоступна'}{gpu_info}")
        
    except Exception as e:
        print(f"Error in startup: {e}")
        raise

# GitHub OAuth конфигурация
GITHUB_CLIENT_ID = os.getenv("GITHUB_CLIENT_ID")
GITHUB_CLIENT_SECRET = os.getenv("GITHUB_CLIENT_SECRET")
GITHUB_REDIRECT_URI = "http://localhost:8000/api/auth/github/callback"

@app.get("/api/auth/github")
async def github_login():
    """Начало GitHub OAuth процесса"""
    return RedirectResponse(
        f"https://github.com/login/oauth/authorize?client_id={GITHUB_CLIENT_ID}&redirect_uri={GITHUB_REDIRECT_URI}&scope=repo"
    )

@app.get("/api/auth/github/callback")
async def github_callback(code: str):
    """Обработка callback от GitHub"""
    try:
        # Получаем access token
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://github.com/login/oauth/access_token",
                json={
                    "client_id": GITHUB_CLIENT_ID,
                    "client_secret": GITHUB_CLIENT_SECRET,
                    "code": code
                },
                headers={"Accept": "application/json"}
            )
            data = response.json()
            access_token = data.get("access_token")
            
            if not access_token:
                raise HTTPException(status_code=400, detail="Failed to get access token")
            
            # Получаем информацию о пользователе
            user_response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                }
            )
            user_data = user_response.json()
            
            return {
                "success": True,
                "access_token": access_token,
                "user": user_data
            }
            
    except Exception as e:
        print(f"GitHub OAuth error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/bot/webapp")
async def get_webapp_url():
    """Get WebApp URL for Telegram bot"""
    return {
        "url": "https://hghdgfire-source.github.io/telegram-mini-app/"
    }

@app.post("/api/chat/send")
async def send_message(message: dict):
    """Send message to bot"""
    try:
        response = chatbot.generate_response(message.get("message", ""))
        return {
            "success": True,
            "message": response
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }

@app.get("/api/settings")
async def get_settings():
    """Get user settings"""
    try:
        settings = {
            "notifications": True,
            "sound": True,
            "theme": "dark",
            "voice": True,
            "tts_enabled": True,
            "facts_enabled": True,
            "thoughts_enabled": True,
            "auto_chat_enabled": False
        }
        return {"success": True, "data": settings}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.get("/api/health")
async def health_check():
    """Проверка состояния сервера"""
    return {
        "status": "ok",
        "cpu": psutil.cpu_percent(),
        "memory": psutil.virtual_memory().percent,
        "gpu": torch.cuda.is_available(),
        "model": "loaded" if chatbot.model is not None else "not_loaded"
    }

# GitHub API endpoints
@app.get("/api/github/repos")
async def get_repos(access_token: str):
    """Получить список репозиториев пользователя"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/user/repos",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                }
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/github/create-repo")
async def create_repo(access_token: str, repo_data: dict):
    """Создать новый репозиторий"""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.github.com/user/repos",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                },
                json=repo_data
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/github/commit")
async def create_commit(access_token: str, commit_data: dict):
    """Создать коммит в репозитории"""
    try:
        repo = commit_data.get("repo")
        path = commit_data.get("path")
        content = commit_data.get("content")
        message = commit_data.get("message")
        
        async with httpx.AsyncClient() as client:
            # Получаем текущий SHA файла, если он существует
            try:
                file_response = await client.get(
                    f"https://api.github.com/repos/{repo}/contents/{path}",
                    headers={
                        "Authorization": f"Bearer {access_token}",
                        "Accept": "application/json"
                    }
                )
                sha = file_response.json().get("sha")
            except:
                sha = None
            
            # Создаем или обновляем файл
            response = await client.put(
                f"https://api.github.com/repos/{repo}/contents/{path}",
                headers={
                    "Authorization": f"Bearer {access_token}",
                    "Accept": "application/json"
                },
                json={
                    "message": message,
                    "content": content,
                    "sha": sha
                }
            )
            return response.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

async def start(update: Update, context):
    """Обработчик команды /start"""
    await update.message.reply_text(
        "Привет! Я Арис, ваш AI-ассистент. Чем могу помочь?\n\n"
        "Доступные команды:\n"
        "/help - Показать справку\n"
        "/webapp - Открыть веб-приложение\n"
        "/repo - Информация о репозитории"
    )

async def help_command(update: Update, context):
    """Обработчик команды /help"""
    await update.message.reply_text(
        "🤖 Справка по командам:\n\n"
        "/start - Начать общение\n"
        "/help - Показать эту справку\n"
        "/webapp - Открыть веб-приложение\n"
        "/repo - Информация о репозитории\n\n"
        "Также вы можете просто написать мне сообщение, и я постараюсь помочь!"
    )

async def handle_webapp_command(update: Update, context):
    """Обработчик команды /webapp"""
    keyboard = InlineKeyboardMarkup([
        [InlineKeyboardButton(
            text="Открыть веб-приложение",
            web_app=WebAppInfo(url="https://hghdgfire-source.github.io/telegram-mini-app/")
        )]
    ])
    await update.message.reply_text(
        "Нажмите кнопку ниже, чтобы открыть веб-приложение:",
        reply_markup=keyboard
    )

async def repo_info(update: Update, context):
    """Обработчик команды /repo"""
    await update.message.reply_text(
        "🔗 Репозиторий проекта:\n"
        "https://github.com/hghdgfire/telegram-mini-app\n\n"
        "📚 Документация:\n"
        "https://hghdgfire-source.github.io/telegram-mini-app/docs"
    )

async def handle_message(update: Update, context):
    """Обработчик текстовых сообщений"""
    message = update.message.text
    response = chatbot.generate_response(message)
    await update.message.reply_text(response)

if __name__ == "__main__":
    # Получаем токен из переменных окружения
    token = os.getenv("TELEGRAM_TOKEN")
    if not token:
        raise ValueError("TELEGRAM_TOKEN not found in environment variables")
        
    # Создаем приложение
    application = Application.builder().token(token).build()
    
    # Добавляем обработчики команд
    application.add_handler(CommandHandler("start", start))
    application.add_handler(CommandHandler("help", help_command))
    application.add_handler(CommandHandler("webapp", handle_webapp_command))
    application.add_handler(CommandHandler("repo", repo_info))
    
    # Обработчик обычных сообщений
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, handle_message))
    
    # Запускаем бота
    print("Starting Telegram bot...")
    application.run_polling()

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import Optional, List, Dict
import json
import os
from datetime import datetime

from chatbot_core import Chatbot
from text_processor import TextProcessor
from schedule_handler import ScheduleHandler

app = FastAPI()

# Настройка CORS для работы с GitHub Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # В продакшене заменить на конкретный домен GitHub Pages
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Инициализация компонентов
chatbot = Chatbot()
text_processor = TextProcessor()
schedule_handler = ScheduleHandler()

# Модели данных
class Message(BaseModel):
    text: str
    type: Optional[str] = "text"

class ScheduleItem(BaseModel):
    id: Optional[str]
    title: str
    description: Optional[str]
    date: str
    time: str
    priority: Optional[str] = "normal"
    status: Optional[str] = "pending"

class TextQuery(BaseModel):
    text: str
    query: Optional[str]

# API endpoints для чата
@app.post("/api/chat/send")
async def send_message(message: Message):
    try:
        if message.type == "text":
            response = chatbot.generate_response(message.text)
        else:
            raise HTTPException(status_code=400, detail="Unsupported message type")
        
        return {"success": True, "message": response}
    except Exception as e:
        return {"success": False, "error": str(e)}

# API endpoints для работы с текстом
@app.post("/api/text/summarize")
async def summarize_text(text_data: TextQuery):
    try:
        summary = text_processor.summarize_text(text_data.text)
        return {"success": True, "summary": summary}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/text/search")
async def search_in_text(text_data: TextQuery):
    try:
        if not text_data.query:
            raise HTTPException(status_code=400, detail="Query is required")
        
        results = text_processor.search_in_text(text_data.text, text_data.query)
        return {"success": True, "results": results}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/text/upload")
async def upload_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        text = text_processor.extract_text_from_file(contents, file.filename)
        return {"success": True, "text": text}
    except Exception as e:
        return {"success": False, "error": str(e)}

# API endpoints для работы с расписанием
@app.get("/api/schedule")
async def get_schedule():
    try:
        items = schedule_handler.get_all_items()
        return {"success": True, "items": items}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/schedule")
async def add_schedule_item(item: ScheduleItem):
    try:
        saved_item = schedule_handler.add_item(item.dict())
        return {"success": True, "item": saved_item}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.put("/api/schedule/{item_id}")
async def update_schedule_item(item_id: str, item: ScheduleItem):
    try:
        updated_item = schedule_handler.update_item(item_id, item.dict())
        return {"success": True, "item": updated_item}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.delete("/api/schedule/{item_id}")
async def delete_schedule_item(item_id: str):
    try:
        schedule_handler.delete_item(item_id)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}

@app.post("/api/schedule/query")
async def query_schedule(query: str = Form(...)):
    try:
        response = schedule_handler.query_schedule(query)
        return {"success": True, "response": response}
    except Exception as e:
        return {"success": False, "error": str(e)}

# Монтируем статические файлы из GitHub Pages
app.mount("/", StaticFiles(directory="docs", html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
