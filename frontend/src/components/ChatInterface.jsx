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

// --- КОМПОНЕНТ 1: Анимированный аватар (для Кейсов 1 и 2) ---
const AvatarVideo = ({ chatState }) => {
  const videoRef = useRef(null);
  const [currentVideoSrc, setCurrentVideoSrc] = useState('/videos/greeting.mp4');
  const [isLooping, setIsLooping] = useState(false);

  useEffect(() => {
    let src = '/videos/idle.mp4';
    let loop = true;

    switch (chatState) {
      case 'greeting':
        src = '/videos/greeting.mp4';
        loop = false;
        break;
      case 'thinking': // Когда бот "думает"
        src = '/videos/idle.mp4';
        loop = true;
        break;
      case 'speaking': // Когда бот "говорит" (озвучивает)
        src = '/videos/suggest_question.mp4'; // Используем "вовлекающую" анимацию
        loop = false;
        break;
      case 'idle':
      default:
        src = '/videos/idle.mp4';
        loop = true;
        break;
    }

    if (currentVideoSrc !== src) {
      setCurrentVideoSrc(src);
    }
    setIsLooping(loop);

  }, [chatState, currentVideoSrc]);

  // Эффект для плавного перехода в idle-состояние после одноразовых анимаций
  useEffect(() => {
    const videoElement = videoRef.current;
    if (!videoElement || isLooping) return;

    const handleVideoEnd = () => {
      // После завершения анимации "приветствия" или "говорения", переключаемся на "ожидание"
      setCurrentVideoSrc('/videos/idle.mp4');
      setIsLooping(true);
    };

    videoElement.addEventListener('ended', handleVideoEnd);
    return () => {
      // Очищаем слушатель при размонтировании или смене видео
      videoElement.removeEventListener('ended', handleVideoEnd);
    };
  }, [currentVideoSrc, isLooping]);


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
        key={currentVideoSrc} // Ключ важен для перезапуска <video> при смене источника
        width="100%"
        height="auto"
        autoPlay
        muted
        loop={isLooping}
        playsInline // Важно для корректной работы на мобильных устройствах
        style={{ borderRadius: 8, marginBottom: 8 }}
      >
        <source src={currentVideoSrc} type="video/mp4" />
        Ваш браузер не поддерживает видео.
      </video>
      <Typography variant="subtitle2" align="center" color="text.secondary">
        Ваш помощник
      </Typography>
    </Box>
  );
};

// --- КОМПОНЕНТ 2: Основной интерфейс чата ---

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
  const [sessionId] = useState(getSessionId());
  const messagesEndRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const [ttsEnabled, setTtsEnabled] = useState(() => localStorage.getItem('ttsEnabled') === 'true');
  const isTtsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [voices, setVoices] = useState([]);
  const [chatState, setChatState] = useState('greeting'); // 'greeting', 'idle', 'thinking', 'speaking'

  // Загрузка истории чата с сервера при первом рендере
  useEffect(() => {
    const fetchHistory = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/chat/history/${sessionId}`);
        if (response.ok) {
          const data = await response.json();
          setMessages(data);
          if (data.length > 0) {
            setChatState('idle'); // Если история есть, аватар сразу в состоянии ожидания
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

  // Загрузка доступных голосов для TTS
  useEffect(() => {
    if (!isTtsSupported) return;
    const loadVoices = () => {
      const availableVoices = window.speechSynthesis.getVoices();
      if (availableVoices.length > 0) {
        setVoices(availableVoices);
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [isTtsSupported]);

  // Функция отправки текстового/распознанного сообщения
  const handleSend = async (questionText = input) => {
    if (!questionText.trim() || isLoading) return;

    const userMessage = { sender: 'user', text: questionText };
    setMessages(prev => [...prev, userMessage]);

    // Очищаем поле ввода только если отправляем из него, а не распознанный текст
    if (questionText === input) {
      setInput('');
    }

    setIsLoading(true);
    setChatState('thinking'); // Переключаем аватара в режим "думает"

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: questionText, session_id: sessionId }),
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      const botMessage = { sender: 'bot', text: data.answer };
      setMessages(prev => [...prev, botMessage]);
    } catch (error) {
      console.error("Ошибка при отправке сообщения:", error);
      const errorMessage = { sender: 'bot', text: 'Произошла ошибка. Попробуйте снова.' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setChatState('speaking'); // Переключаем аватара в режим "говорит"
    }
  };

  // Автоскролл к последнему сообщению
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Озвучивание новых сообщений бота при включенном TTS
  useEffect(() => {
    if (!ttsEnabled || !isTtsSupported || !messages.length || voices.length === 0) {
      return;
    }

    const lastMessage = messages[messages.length - 1];

    if (lastMessage && lastMessage.sender === 'bot' && lastMessage.text) {
      try {
        window.speechSynthesis.cancel(); // Отменяем предыдущее озвучивание

        // Очищаем текст от Markdown для корректного произношения
        let cleanText = lastMessage.text
          .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // [текст](url) -> текст
          .replace(/\*\*/g, '') // **жирный** -> жирный
          .replace(/#/g, '');   // #Заголовок -> Заголовок

        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.lang = 'ru-RU';
        utterance.rate = 0.95; // Немного замедляем речь

        // Продвинутый выбор голоса
        let bestVoice = voices.find(v => v.lang.startsWith('ru') && v.name.includes('Google') && v.name.toLowerCase().includes('male'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('ru') && v.gender === 'male');
        if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('ru') && v.name.includes('Google'));
        if (!bestVoice) bestVoice = voices.find(v => v.lang.startsWith('ru'));

        if (bestVoice) {
          utterance.voice = bestVoice;
        }

        // Когда озвучка заканчивается, возвращаем аватара в idle-состояние
        utterance.onend = () => setChatState('idle');

        window.speechSynthesis.speak(utterance);

      } catch (e) {
        console.error("Ошибка синтеза речи:", e);
        setChatState('idle'); // В случае ошибки все равно возвращаем в idle
      }
    }
  }, [messages, ttsEnabled, isTtsSupported, voices]);

  // Переключатель TTS
  const handleToggleTts = () => {
    if (!isTtsSupported) {
      alert('Озвучка не поддерживается в этом браузере.');
      return;
    }
    const newValue = !ttsEnabled;
    setTtsEnabled(newValue);
    localStorage.setItem('ttsEnabled', String(newValue));
    if (!newValue) {
      try { window.speechSynthesis.cancel(); } catch (e) {}
    }
  };

  // Запись и отправка голосового сообщения
  const handleRecordToggle = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      setIsRecording(false);
      setIsLoading(true); // Показываем индикатор, пока аудио обрабатывается
      setChatState('thinking');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const formData = new FormData();
        formData.append('session_id', sessionId);
        formData.append('audio_file', audioBlob, 'voice-message.webm');

        try {
          const response = await fetch('/api/chat/audio', {
            method: 'POST',
            body: formData,
          });
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }
          const data = await response.json();

          if (data && data.transcribed_question) {
            // Добавляем распознанный вопрос в историю и передаем его в handleSend
            const userMessage = { sender: 'user', text: data.transcribed_question };
            setMessages(prev => [...prev, userMessage]);

            // Теперь вызываем RAG-цепочку
            const botMessage = { sender: 'bot', text: data.answer };
            setMessages(prev => [...prev, botMessage]);

          } else {
             throw new Error("Некорректный ответ от сервера");
          }
        } catch (err) {
          console.error('Ошибка отправки аудио:', err);
          const errorMessage = { sender: 'bot', text: 'Не удалось распознать аудио. Попробуйте еще раз.' };
          setMessages(prev => [...prev, errorMessage]);
        } finally {
          setIsLoading(false);
          setChatState('speaking');
          // Останавливаем все дорожки микрофона
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Доступ к микрофону отклонен или не поддерживается:', err);
      alert('Не удалось получить доступ к микрофону. Пожалуйста, проверьте разрешения в настройках вашего браузера.');
    }
  };

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
              ml: 1, p: 1.5, borderRadius: 2, bgcolor: 'action.hover',
              color: 'secondary.main', '&:hover': { bgcolor: 'action.selected', color: 'secondary.dark' }
            }}
          >
            {mode === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center', overflow: 'hidden' }}>
        <Box sx={{ display: 'flex', width: '100%', maxWidth: 1200, gap: 2, height: '100%' }}>

          {/* Блок с анимированным аватаром */}
          <Box
            sx={{
              display: { xs: 'none', md: 'flex' }, flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', minWidth: 180, maxWidth: 220, height: '100%',
            }}
          >
            <AvatarVideo chatState={chatState} />
          </Box>

          {/* Область сообщений */}
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
                      borderColor: isUser ? 'transparent' : 'divider',
                      boxShadow: isUser ? '0 2px 8px rgba(0, 0, 0, 0.1)' : '0 1px 3px rgba(0, 0, 0, 0.05)',
                      transition: 'all 0.2s ease-in-out',
                      '&:hover': { boxShadow: isUser ? '0 4px 12px rgba(0, 0, 0, 0.15)' : '0 2px 6px rgba(0, 0, 0, 0.08)' }
                    }}>
                      <Typography variant="body1" sx={{
                        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: '0.95rem', lineHeight: 1.5
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
                    px: 2.5, py: 1.5, borderRadius: 3, border: '1px solid', borderColor: 'divider',
                    bgcolor: 'background.paper', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)'
                  }}>
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

      {/* Поле ввода */}
      <Box sx={{
        position: 'sticky', bottom: 0, borderTop: 1, borderColor: 'divider',
        bgcolor: mode === 'dark' ? 'rgba(18, 18, 18, 0.8)' : 'rgba(255, 255, 255, 0.8)',
        backdropFilter: 'blur(8px)'
      }}>
        <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', p: 3 }}>
          <Paper
            component="form"
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            sx={{
              display: 'flex', alignItems: 'center', px: 2, py: 1,
              bgcolor: 'background.paper', borderRadius: 4, border: '1px solid', borderColor: 'divider',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)', transition: 'all 0.2s ease-in-out',
              '&:focus-within': { boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', borderColor: 'primary.main' }
            }}
          >
            <IconButton
              onClick={handleToggleTts}
              color={ttsEnabled ? 'primary' : 'default'}
              aria-label="toggle tts"
              sx={{ mr: 1, p: 1.25, borderRadius: 2 }}
            >
              {ttsEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
            </IconButton>

            <InputBase
              placeholder="Задайте ваш вопрос..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              onKeyPress={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
              sx={{
                ml: 1, flex: 1, py: 1.5, fontSize: '0.95rem',
                '& .MuiInputBase-input': { '&::placeholder': { opacity: 0.7, fontWeight: 400 } }
              }}
            />
            <IconButton
              onClick={handleRecordToggle}
              color={isRecording ? 'secondary' : 'default'}
              aria-label="record voice"
              disabled={isLoading}
              sx={{
                mr: 1, p: 1.5, borderRadius: 2, bgcolor: isRecording ? 'secondary.main' : 'action.hover',
                color: isRecording ? 'secondary.contrastText' : 'text.secondary',
                transition: 'all 0.2s ease-in-out',
                '&:hover': { bgcolor: isRecording ? 'secondary.dark' : 'action.selected' }
              }}
            >
              {isRecording ? <MicOff size={20} /> : <Mic size={20} />}
            </IconButton>
            <IconButton
              type="submit"
              color="primary"
              disabled={isLoading || !input.trim()}
              sx={{
                p: 1.5, borderRadius: 2, bgcolor: input.trim() ? 'primary.main' : 'action.hover',
                color: input.trim() ? 'primary.contrastText' : 'text.secondary',
                transition: 'all 0.2s ease-in-out',
                '&:hover': { bgcolor: input.trim() ? 'primary.dark' : 'action.selected' }
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