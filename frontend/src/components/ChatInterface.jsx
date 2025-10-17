import React, { useState, useEffect, useRef } from 'react';
import { Send, Sun, Moon, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import {
  AppBar,
  Avatar,
  Box,
  CircularProgress,
  IconButton,
  InputBase,
  Paper,
  Toolbar,
  Typography
} from '@mui/material';

// --- КОМПОНЕНТ 1: АНИМИРОВАННЫЙ АВАТАР С ПОДДЕРЖКОЙ ТЕМ ---
const AvatarVideo = ({ chatState, mode }) => {
  const videoRef = useRef(null);
  const [currentVideo, setCurrentVideo] = useState({ src: `/videos/greeting_${mode}.mp4`, loop: false });

  useEffect(() => {
    let baseName = 'idle';
    let newLoop = true;

    switch (chatState) {
      case 'greeting':
        baseName = 'greeting';
        newLoop = false;
        break;
      case 'thinking':
        baseName = 'talking';
        newLoop = true;
        break;
      case 'speaking':
        baseName = 'speaking';
        newLoop = false;
        break;
      case 'idle':
      default:
        baseName = 'talking';
        newLoop = true;
        break;
    }

    const newSrc = `/videos/${baseName}_${mode}.mp4`;

    if (currentVideo.src !== newSrc) {
      setCurrentVideo({ src: newSrc, loop: newLoop });
    }
  }, [chatState, mode, currentVideo.src]);

  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || currentVideo.loop) return;

    const handleVideoEnd = () => {
      setCurrentVideo({ src: `/videos/talking_${mode}.mp4`, loop: true });
    };

    videoElement.addEventListener('ended', handleVideoEnd);
    return () => {
      videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [currentVideo.loop, mode]);

  return (
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
      <video
        ref={videoRef}
        key={currentVideo.src}
        width="100%"
        height="auto"
        autoPlay
        muted
        loop={currentVideo.loop}
        playsInline
        style={{ borderRadius: 8, marginBottom: 8 }}
      >
        <source src={currentVideo.src} type="video/mp4" />
        Ваш браузер не поддерживает видео.
      </video>
      <Typography variant="subtitle2" align="center" color="text.secondary">
        Ваш помощник
      </Typography>
    </Box>
  );
};

// --- КОМПОНЕНТ 2: ОСНОВНОЙ ИНТЕРФЕЙС ЧАТА ---
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
  const [sessionId] = useState(getSessionId());
  const messagesEndRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('ttsEnabled') === 'true');
  const [chatState, setChatState] = useState('greeting');
  const audioPlayerRef = useRef(null); // Реф для управления аудио-плеером

  // Загрузка истории чата
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/chat/history/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
          if (data.length > 0) {
            setChatState('idle');
          }
        }
      } catch (error) {
        console.error("Ошибка при загрузке истории:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, [sessionId]);

  // --- НОВАЯ ФУНКЦИЯ: Проигрывание аудио из Base64 ---
  const playAudioFromBase64 = (base64String) => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
    }
    const audio = new Audio(`data:audio/wav;base64,${base64String}`);
    audioPlayerRef.current = audio;

    audio.play();
    setChatState('speaking');

    audio.onended = () => {
      setChatState('idle');
    };
    audio.onerror = (e) => {
      console.error("Ошибка воспроизведения аудио:", e);
      setChatState('idle');
    };
  };

  // Отправка текстового сообщения
  const handleSend = async (questionText = input) => {
    if (!questionText.trim() || isLoading) return;
    const userMessage = { sender: 'user', text: questionText };
    setMessages(prev => [...prev, userMessage]);
    if (questionText === input) { setInput(''); }

    setIsLoading(true);
    setChatState('thinking');

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, session_id: sessionId }),
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data = await response.json();
      const botMessage = { sender: 'bot', text: data.answer };
      setMessages(prev => [...prev, botMessage]);

      if (ttsEnabled && data.audio_content) {
        playAudioFromBase64(data.audio_content);
      } else {
        setChatState('idle');
      }

    } catch (error) {
      console.error("Ошибка при отправке сообщения:", error);
      setMessages(prev => [...prev, { sender: 'bot', text: 'Произошла ошибка. Попробуйте снова.' }]);
      setChatState('idle');
    } finally {
      setIsLoading(false);
    }
  };

  // Автоскролл
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Переключатель TTS
  const handleToggleTts = () => {
    const newValue = !ttsEnabled;
    setTtsEnabled(newValue);
    localStorage.setItem('ttsEnabled', String(newValue));
    if (!newValue && audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      setChatState('idle');
    }
  };

  // Запись и отправка аудио (ASR)
  const handleRecordToggle = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setIsLoading(true);
        setChatState('thinking');

        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('audio_file', audioBlob, 'voice-message.webm');

        try {
          const response = await fetch('/api/chat/audio', { method: 'POST', body: formData });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();

          const userMessageText = data.transcribed_question || "(Не удалось распознать аудио)";
          const userMessage = { sender: 'user', text: userMessageText };
          const botMessage = { sender: 'bot', text: data.answer };

          setMessages(prev => [...prev, userMessage, botMessage]);

          if (ttsEnabled && data.audio_content) {
            playAudioFromBase64(data.audio_content);
          } else {
            setChatState('idle');
          }

        } catch (err) {
          console.error('Ошибка отправки аудио:', err);
          setMessages(prev => [...prev, { sender: 'bot', text: 'Произошла ошибка при обработке аудио.' }]);
          setChatState('idle');
        } finally {
          setIsLoading(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Доступ к микрофону отклонен:', err);
      alert('Не удалось получить доступ к микрофону. Проверьте разрешения в настройках браузера.');
    }
  };

  return (
    <Box display="flex" flexDirection="column" height="100vh" width="100%" sx={{ bgcolor: 'background.default' }}>
      <AppBar position="sticky" color="default" elevation={0} sx={{
        borderBottom: 1, borderColor: 'divider', backdropFilter: 'blur(8px)',
        bgcolor: mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)'
      }}>
        <Toolbar sx={{ maxWidth: 1200, mx: 'auto', width: '100%', py: 1 }}>
          <Avatar src="/transneft_logo.png" alt="Логотип" sx={{ mr: 2, bgcolor: 'primary.main', width: 40, height: 40 }}>ТН</Avatar>
          <Box>
            <Typography variant="h6" color="text.primary" sx={{ lineHeight: 1.2, fontWeight: 600 }}>Цифровой консультант</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: '0.75rem', fontWeight: 500 }}>ПАО «Транснефть»</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <IconButton onClick={toggleColorMode} color="secondary" aria-label="toggle theme" sx={{ ml: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover', color: 'secondary.main', '&:hover': { bgcolor: 'action.selected', color: 'secondary.dark' } }}>
            {mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', width: '100%', maxWidth: 1200, gap: 2, height: '100%' }}>

          <Box sx={{ display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minWidth: 220, maxWidth: 260, height: '100%', p: 2 }}>
            <AvatarVideo chatState={chatState} mode={mode} />
          </Box>

          <Box id="messages-scroll" sx={{ flex: 1, overflowY: 'auto', px: { xs: 2, sm: 3, md: 4 }, py: 3 }}>
            <Box display="flex" flexDirection="column" gap={1.5}>

              {messages.map((msg, index) => {
                const isUser = msg.sender === 'user';
                return (
                  <Box key={index} display="flex" justifyContent={isUser ? 'flex-end' : 'flex-start'} sx={{ mb: 1 }}>
                    <Paper elevation={isUser ? 2 : 1} sx={{
                      px: 2.5, py: 1.5, maxWidth: { xs: '88%', md: '70%' },
                      bgcolor: isUser ? 'primary.main' : 'background.paper',
                      color: isUser ? 'primary.contrastText' : 'text.primary',
                      borderRadius: 3, border: isUser ? 'none' : '1px solid',
                      borderColor: 'transparent',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                    }}>
                      <Typography variant="body1" sx={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem', lineHeight: 1.5 }}>
                        {msg.text}
                      </Typography>
                    </Paper>
                  </Box>
                );
              })}

              {isLoading && (
                <Box display="flex" justifyContent="flex-start" sx={{ mb: 1 }}>
                  <Paper elevation={1} sx={{ px: 2.5, py: 1.5, borderRadius: 3, bgcolor: 'background.paper', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
                    <Box display="flex" alignItems="center" gap={1.5}>
                      <CircularProgress size={18} thickness={4} />
                      <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>Обработка...</Typography>
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
        position: 'sticky', bottom: 0, borderTop: 1, borderColor: 'divider',
        bgcolor: mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)'
      }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', p: { xs: 2, sm: 3 } }}>
          <Paper
            component="form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            sx={{
              display: 'flex', alignItems: 'center', px: 2, py: 1, bgcolor: 'background.paper',
              borderRadius: 4, border: '1px solid', borderColor: 'divider', boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              '&:focus-within': { boxShadow: '0 4px 12px rgba(0,0,0,0.15)', borderColor: 'primary.main' }
            }}
          >
            <IconButton onClick={handleToggleTts} color={ttsEnabled ? 'primary' : 'default'} aria-label="toggle tts" sx={{ mr: 1, p: 1.25, borderRadius: 2 }}>
              {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </IconButton>

            <InputBase
              placeholder="Задайте ваш вопрос..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              sx={{ ml: 1, flex: 1, py: 1.5, fontSize: '0.95rem' }}
              multiline
              maxRows={5}
            />
            <IconButton onClick={handleRecordToggle} color={isRecording ? 'error' : 'default'} aria-label="record voice" disabled={isLoading} sx={{
                mr: 1, p: 1.5, borderRadius: 2,
                bgcolor: isRecording ? 'error.main' : 'action.hover',
                color: isRecording ? 'error.contrastText' : 'text.secondary',
                '&:hover': { bgcolor: isRecording ? 'error.dark' : 'action.selected' }
              }}>
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </IconButton>
            <IconButton type="submit" color="primary" disabled={isLoading || !input.trim()} sx={{ p: 1.5, borderRadius: 2 }}>
              <Send size={20} />
            </IconButton>
          </Paper>
        </Box>
      </Box>
    </Box>
  );
};

export default ChatInterface;