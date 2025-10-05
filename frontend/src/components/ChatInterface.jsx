import React, { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react'; // Красивые иконки
import { v4 as uuidv4 } from 'uuid'; // Генератор ID для сессий

// Функция для получения или создания session_id из localStorage
const getSessionId = () => {
  let sessionId = localStorage.getItem('chatSessionId');
  if (!sessionId) {
    sessionId = uuidv4();
    localStorage.setItem('chatSessionId', sessionId);
  }
  return sessionId;
};

const ChatInterface = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sessionId] = useState(getSessionId()); // Получаем ID при первом рендере
  const messagesEndRef = useRef(null);

  // 1. Загружаем историю чата с сервера при первой загрузке
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8000/api/chat/history/${sessionId}`);
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
      const response = await fetch('http://127.0.0.1:8000/api/chat', {
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
    <>
      {/* Заголовок чата */}
      <header className="p-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-800">Цифровой консультант</h2>
        <p className="text-sm text-gray-500">ПАО «Транснефть»</p>
      </header>

      {/* Окно сообщений */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="flex flex-col gap-4">
          {messages.map((msg, index) => (
            <div key={index} className={`flex items-end gap-2 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg break-words ${msg.sender === 'user' ? 'bg-brand-blue text-white' : 'bg-gray-200 text-gray-800'}`}>
                {msg.text}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
                <div className="bg-gray-200 text-gray-800 rounded-lg px-4 py-2">
                    <span className="animate-pulse">...</span>
                </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Поле ввода */}
      <footer className="p-4 border-t border-gray-200">
        <div className="flex items-center bg-gray-100 rounded-lg">
          <input
            type="text"
            value={input}
            disabled={isLoading}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Задайте ваш вопрос..."
            className="flex-1 bg-transparent p-3 focus:outline-none text-gray-700 disabled:opacity-50"
          />
          <button onClick={handleSend} disabled={isLoading} className="p-3 text-white bg-brand-red rounded-r-lg hover:bg-red-700 transition-colors disabled:bg-red-400">
            <Send size={20} />
          </button>
        </div>
      </footer>
    </>
  );
};

export default ChatInterface;