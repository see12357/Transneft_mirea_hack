import React, { useState, useEffect, useRef } from 'react';
import { Send, Sun, Moon } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  AppBar,
  Avatar,
  Box,
  CircularProgress,
  Container,
  IconButton,
  InputBase,
  Paper,
  Toolbar,
  Typography
} from '@mui/material';

// Функция для получения или создания session_id из localStorage
const getSessionId = () => {
  let sessionId = localStorage.getItem('chatSessionId');
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem('chatSessionId', sessionId);
  }
  return sessionId;
};

const ChatInterface = ({ mode, toggleColorMode }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(getSessionId()); // Получаем ID при первом рендере
  const messagesEndRef = useRef(null);

  // 1. Загружаем историю чата с сервера при первой загрузке
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`/api/chat/history/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
        }
      } catch (error) {
        console.error("Ошибка при загрузке истории:", error);
      }
    };
    fetchHistory();
  }, [sessionId]);

  // 2. Функция отправки сообщения
  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = { sender: 'user', text: input };
    setMessages(prevMessages => [...prevMessages, userMessage]);
    const currentInput = input;
    setInput('');
    setIsLoading(true);

    try {
      // Отправляем запрос с вопросом И session_id
      const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
              question: currentInput,
              session_id: sessionId
          }),
      });

      const data = await response.json();
      const botMessage = { sender: 'bot', text: data.answer };

      setMessages(prevMessages => [...prevMessages, botMessage]);
      
    } catch (error) {
        console.error("Ошибка при отправке сообщения:", error);
        const errorMessage = { sender: 'bot', text: 'Произошла ошибка. Попробуйте снова.' };
        setMessages(prevMessages => [...prevMessages, errorMessage]);
    } finally {
        setIsLoading(false);
    }
  };

  // 3. Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <Box display="flex" flexDirection="column" height="100vh" width="100%" sx={{ bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="default" elevation={0} sx={{ 
        borderBottom: 1, 
        borderColor: 'divider', 
        backdropFilter: 'blur(8px)', 
        bgcolor: mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)'
      }}>
        <Toolbar sx={{ maxWidth: 1200, mx: 'auto', width: '100%', py: 1 }}>
          <Avatar src="/transneft_logo.png" alt="Логотип" sx={{ mr: 2, bgcolor: 'primary.main', width: 40, height: 40 }}>ТН</Avatar>
          <Box>
            <Typography variant="h6" color="text.primary" sx={{ lineHeight: 1.2, fontWeight: 600 }}>Цифровой консультант</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>ПАО «Транснефть»</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <IconButton 
            onClick={toggleColorMode} 
            color="secondary" 
            aria-label="toggle theme" 
            sx={{ 
              ml: 1, 
              p: 1.5, 
              borderRadius: 2,
              bgcolor: 'action.hover',
              color: 'secondary.main',
              '&:hover': {
                bgcolor: 'action.selected',
                color: 'secondary.dark'
              }
            }}
          >
            {mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
        <Box sx={{ display: 'flex', width: '100%', maxWidth: 1200, gap: 2, height: '100%' }}>
          {/* Badger image window (left, vertically centered) */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' },
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minWidth: 180,
              maxWidth: 220,
              height: '100%',
            }}
          >
            <Box
              sx={{
                bgcolor: 'background.paper',
                borderRadius: 3,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                border: '1px solid',
                borderColor: 'divider',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                width: '100%',
              }}
            >
              <img
                src="/transneftbro.png"
                alt="Транснефть Барсук"
                style={{ width: '100%', height: 'auto', borderRadius: 8, marginBottom: 8 }}
              />
              <Typography variant="subtitle2" align="center" color="text.secondary">
                Ваш помощник
              </Typography>
            </Box>
          </Box>
          {/* Chat Messages Area */}
          <Box id="messages-scroll" sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
            <Box display="flex" flexDirection="column" gap={1.5}>
              
              {messages.map((msg, index) => {
                const isUser = msg.sender === 'user';
                return (
                  <Box key={index} display="flex" justifyContent={isUser ? 'flex-end' : 'flex-start'} sx={{ mb: 1 }}>
                    <Paper elevation={isUser ? 2 : 1} sx={{
                      px: 2.5,
                      py: 1.5,
                      maxWidth: { xs: '88%', md: '70%' },
                      bgcolor: isUser ? 'primary.main' : 'background.paper',
                      color: isUser ? 'primary.contrastText' : 'text.primary',
                      borderRadius: 3,
                      border: isUser ? 'none' : '1px solid',
                      borderColor: isUser ? 'transparent' : 'divider',
                      boxShadow: isUser 
                        ? '0 2px 8px rgba(0, 0, 0, 0.1)' 
                        : '0 1px 3px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': {
                        boxShadow: isUser 
                          ? '0 4px 12px rgba(0, 0, 0, 0.15)' 
                          : '0 2px 6px rgba(0, 0, 0, 0.08)'
                      }
                    }}>
                      <Typography variant="body1" sx={{ 
                        whiteSpace: 'pre-wrap', 
                        wordBreak: 'break-word',
                        fontSize: '0.95rem',
                        lineHeight: 1.5
                      }}>
                        {msg.text}
                      </Typography>
                    </Paper>
                  </Box>
                );
              })}

              {isLoading && (
                <Box display="flex" justifyContent="flex-start" sx={{ mb: 1 }}>
                  <Paper elevation={1} sx={{ 
                    px: 2.5, 
                    py: 1.5, 
                    borderRadius: 3, 
                    border: '1px solid', 
                    borderColor: 'divider',
                    bgcolor: 'background.paper',
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <CircularProgress size={18} thickness={4} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Печатает…</Typography>
                    </Box>
                  </Paper>
                </Box>
              )}
              <div ref={messagesEndRef} />
            </Box>
          </Box>
          
        </Box>
      </Box>

      <Box sx={{ 
        position: 'sticky', 
        bottom: 0, 
        borderTop: 1, 
        borderColor: 'divider', 
        bgcolor: mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)'
      }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', p: 3 }}>
          <Paper
            component="form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            sx={{ 
              display: 'flex', 
              alignItems: 'center', 
              px: 2, 
              py: 1, 
              bgcolor: 'background.paper', 
              borderRadius: 4,
              border: '1px solid',
              borderColor: 'divider',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
              transition: 'all 0.2s ease-in-out',
              '&:focus-within': {
                boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                borderColor: 'primary.main'
              }
            }}
          >
            <InputBase
              placeholder="Задайте ваш вопрос..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              sx={{ 
                ml: 1, 
                flex: 1, 
                py: 1.5,
                fontSize: '0.95rem',
                '& .MuiInputBase-input': {
                  '&::placeholder': {
                    opacity: 0.7,
                    fontWeight: 400
                  }
                }
              }}
            />
            <IconButton 
              type="submit" 
              color="primary" 
              disabled={isLoading || !input.trim()} 
              sx={{ 
                p: 1.5, 
                borderRadius: 2,
                bgcolor: input.trim() ? 'primary.main' : 'action.hover',
                color: input.trim() ? 'primary.contrastText' : 'text.secondary',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                  bgcolor: input.trim() ? 'primary.dark' : 'action.selected'
                }
              }}
            >
              <Send size={20} />
            </IconButton>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatInterface;