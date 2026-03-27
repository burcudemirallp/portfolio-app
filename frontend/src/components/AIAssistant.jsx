import { useState, useEffect, useRef } from 'react';
import { X, Send, Loader2, Bot, User, Sparkles } from 'lucide-react';
import { chatWithAI, getAIStatus, getQuickAnalysis } from '../services/api';

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAiStatus] = useState({ available: false, status: 'checking' });
  const messagesEndRef = useRef(null);

  // Check AI status on mount
  useEffect(() => {
    checkAIStatus();
  }, []);

  // Scroll to bottom when messages change
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkAIStatus = async () => {
    try {
      const status = await getAIStatus();
      setAiStatus(status);
      
      if (status.available && messages.length === 0) {
        // Add welcome message
        setMessages([{
          role: 'assistant',
          content: 'Hello! I\'m your portfolio assistant. I can provide information about your portfolio, perform analysis, and answer your questions. How can I help you?',
          timestamp: new Date().toISOString()
        }]);
      }
    } catch (error) {
      console.error('AI status check failed:', error);
      setAiStatus({ available: false, status: 'offline' });
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');

    // Add user message
    const newMessages = [
      ...messages,
      {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
      }
    ];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      // Prepare conversation history (last 10 messages)
      const conversationHistory = newMessages.slice(-10).map(msg => ({
        role: msg.role,
        content: msg.content
      }));

      // Call AI API
      const response = await chatWithAI({
        message: userMessage,
        include_portfolio: true,
        conversation_history: conversationHistory
      });

      // Add AI response (boş yanıt fallback)
      const content = (response?.response && response.response.trim()) || 'Yanıt alınamadı. Ollama çalışıyor mu? Model yüklü mü? (örn. ollama run llama3.2)';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content,
          timestamp: response?.timestamp || new Date().toISOString()
        }
      ]);
    } catch (error) {
      console.error('AI chat error:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Sorry, an error occurred. Please try again.',
          timestamp: new Date().toISOString(),
          error: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAnalysis = async () => {
    setIsLoading(true);
    
    // Add user message
    const newMessages = [
      ...messages,
      {
        role: 'user',
        content: 'Portföyümü analiz et',
        timestamp: new Date().toISOString()
      }
    ];
    setMessages(newMessages);

    try {
      const response = await getQuickAnalysis();
      const content = (response?.analysis && response.analysis.trim()) || 'Analiz üretilemedi. Ollama çalışıyor ve model yüklü mü?';
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content,
          timestamp: response?.timestamp || new Date().toISOString()
        }
      ]);
    } catch (error) {
      console.error('Quick analysis error:', error);
      setMessages([
        ...newMessages,
        {
          role: 'assistant',
          content: 'Analysis could not be generated. Please try again.',
          timestamp: new Date().toISOString(),
          error: true
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const quickQuestions = [
    'Analyze my portfolio',
    'What are my most profitable positions?',
    'What is my risk status?',
    'Is my diversification sufficient?'
  ];

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 bg-bnc-accent text-bnc-bg p-6 rounded-full shadow-2xl hover:bg-bnc-accentHover transition-all duration-300 hover:scale-110 z-[9999] group animate-pulse"
        title="AI Asistan"
        style={{ width: '80px', height: '80px' }}
      >
        <Sparkles className="w-8 h-8 group-hover:rotate-12 transition-transform" />
        {aiStatus.available && (
          <span className="absolute top-0 right-0 w-4 h-4 bg-bnc-green rounded-full border-2 border-bnc-surface"></span>
        )}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 w-96 h-[600px] bg-bnc-surface rounded-lg shadow-2xl flex flex-col z-50 border border-bnc-border">
      {/* Header */}
      <div className="bg-bnc-surfaceAlt text-bnc-textPri p-4 rounded-t-lg flex items-center justify-between border-b border-bnc-border">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-lg bg-bnc-accent/20 flex items-center justify-center">
            <Bot className="w-5 h-5 text-bnc-accent" />
          </div>
          <div>
            <h3 className="font-semibold text-bnc-textPri">AI Portföy Asistanı</h3>
            <p className="text-xs text-bnc-textSec">
              {aiStatus.available ? 'Online' : 'Offline'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="hover:bg-bnc-border p-1 rounded transition-colors text-bnc-textSec"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-bnc-bg">
        {!aiStatus.available && (
          <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-3 text-sm">
            <p className="text-bnc-accent">
              AI service is offline. Make sure Ollama is running:
            </p>
            <code className="text-xs bg-bnc-surface text-bnc-textPri px-2 py-1 rounded mt-2 block border border-bnc-border">
              ollama serve
            </code>
          </div>
        )}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-bnc-accent/20 flex items-center justify-center flex-shrink-0 border border-bnc-accent/40">
                <Bot className="w-4 h-4 text-bnc-accent" />
              </div>
            )}
            <div
              className={`max-w-[80%] rounded-lg p-3 ${
                msg.role === 'user'
                  ? 'bg-bnc-accent text-bnc-bg'
                  : msg.error
                  ? 'bg-bnc-red/10 text-bnc-red border border-bnc-red/40'
                  : 'bg-bnc-surfaceAlt text-bnc-textPri border border-bnc-border'
              }`}
            >
              <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
              <p className="text-xs text-bnc-textTer mt-1">
                {new Date(msg.timestamp).toLocaleTimeString('tr-TR', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
            </div>
            {msg.role === 'user' && (
              <div className="w-8 h-8 rounded-full bg-bnc-accent flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-bnc-bg" />
              </div>
            )}
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2 justify-start">
            <div className="w-8 h-8 rounded-full bg-bnc-accent/20 flex items-center justify-center border border-bnc-accent/40">
              <Bot className="w-4 h-4 text-bnc-accent" />
            </div>
            <div className="bg-bnc-surfaceAlt border border-bnc-border rounded-lg p-3">
              <Loader2 className="w-5 h-5 animate-spin text-bnc-accent" />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Quick Questions */}
      {messages.length <= 1 && aiStatus.available && (
        <div className="px-4 pb-2 bg-bnc-bg border-t border-bnc-border pt-2">
          <p className="text-xs text-bnc-textTer mb-2">Quick questions:</p>
          <div className="flex flex-wrap gap-2">
            {quickQuestions.map((question, index) => (
              <button
                key={index}
                onClick={() => {
                  setInputMessage(question);
                }}
                className="text-xs bg-bnc-surfaceAlt hover:bg-bnc-border text-bnc-textSec px-2 py-1 rounded border border-bnc-border transition-colors"
                disabled={isLoading}
              >
                {question}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input */}
      <div className="p-4 border-t border-bnc-border bg-bnc-surface">
        <div className="flex gap-2">
          <textarea
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={aiStatus.available ? "Ask a question..." : "AI service offline"}
            disabled={!aiStatus.available || isLoading}
            className="flex-1 resize-none rounded-lg bnc-input px-3 py-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            rows={2}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || !aiStatus.available || isLoading}
            className="bg-bnc-accent hover:bg-bnc-accentHover text-bnc-bg p-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
