import { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, Modal, KeyboardAvoidingView, Platform, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { getAIStatus, chatWithAI, getQuickAnalysis } from '../services/api';

const QUICK_QUESTIONS = [
  'Portföyümü analiz et',
  'En riskli pozisyonum hangisi?',
  'Portföyümü nasıl çeşitlendirebilirim?',
  'Hızlı analiz yap',
];

export default function AIAssistant() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [aiStatus, setAIStatus] = useState({ available: false, status: 'checking' });
  const flatListRef = useRef(null);

  useEffect(() => {
    getAIStatus().then(setAIStatus);
  }, []);

  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        role: 'assistant',
        content: 'Merhaba! Ben Portfolio Tracker AI asistanıyım. Portföyünüz hakkında sorular sorabilirsiniz.',
        timestamp: new Date().toISOString(),
      }]);
    }
  }, [isOpen]);

  const sendMessage = async (text) => {
    const msg = text || inputMessage.trim();
    if (!msg) return;
    setInputMessage('');
    const userMsg = { role: 'user', content: msg, timestamp: new Date().toISOString() };
    setMessages(prev => [...prev, userMsg]);
    setIsLoading(true);
    try {
      let result;
      if (msg === 'Hızlı analiz yap') {
        result = await getQuickAnalysis();
      } else {
        const history = messages.slice(-10).map(m => ({ role: m.role, content: m.content }));
        result = await chatWithAI({ message: msg, conversation_history: history, include_portfolio: true });
      }
      setMessages(prev => [...prev, { role: 'assistant', content: result.response || result.analysis || 'Yanıt alınamadı.', timestamp: new Date().toISOString() }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hata oluştu: ' + (err.response?.data?.detail || err.message), timestamp: new Date().toISOString(), error: true }]);
    } finally { setIsLoading(false); }
  };

  const renderMessage = ({ item }) => {
    const isUser = item.role === 'user';
    return (
      <View className={`mb-3 max-w-[85%] ${isUser ? 'self-end' : 'self-start'}`}>
        <View className={`rounded-2xl px-4 py-3 ${isUser ? 'bg-blue-600' : item.error ? 'bg-red-100 dark:bg-red-900/30' : 'bg-gray-100 dark:bg-gray-700'}`}>
          <Text className={`text-sm ${isUser ? 'text-white' : item.error ? 'text-red-700 dark:text-red-300' : 'text-gray-900 dark:text-white'}`}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <>
      {/* Floating Button */}
      <TouchableOpacity
        onPress={() => setIsOpen(true)}
        className="absolute bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 items-center justify-center shadow-lg"
        style={{ elevation: 5, zIndex: 100 }}
      >
        <Feather name="message-circle" size={24} color="#fff" />
        {aiStatus.available && <View className="absolute top-1 right-1 w-3 h-3 rounded-full bg-green-400 border-2 border-blue-600" />}
      </TouchableOpacity>

      {/* Chat Modal */}
      <Modal visible={isOpen} animationType="slide" onRequestClose={() => setIsOpen(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} className="flex-1 bg-white dark:bg-gray-900">
          {/* Header */}
          <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pt-14">
            <View>
              <Text className="text-lg font-bold text-gray-900 dark:text-white">AI Asistan</Text>
              <Text className={`text-xs ${aiStatus.available ? 'text-green-500' : 'text-gray-400'}`}>{aiStatus.available ? 'Çevrimiçi' : 'Çevrimdışı'}</Text>
            </View>
            <TouchableOpacity onPress={() => setIsOpen(false)} className="p-2">
              <Feather name="x" size={24} color="#6b7280" />
            </TouchableOpacity>
          </View>

          {/* Messages */}
          <FlatList
            ref={flatListRef}
            data={messages}
            keyExtractor={(_, i) => String(i)}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 16, paddingBottom: 8 }}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            ListFooterComponent={isLoading ? <ActivityIndicator size="small" color="#3b82f6" style={{ marginTop: 8 }} /> : null}
          />

          {/* Quick Questions */}
          {messages.length <= 1 && (
            <View className="px-4 pb-2 flex-row flex-wrap gap-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <TouchableOpacity key={i} onPress={() => sendMessage(q)} className="bg-gray-100 dark:bg-gray-700 px-3 py-2 rounded-xl">
                  <Text className="text-xs text-gray-700 dark:text-gray-300">{q}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* Input */}
          <View className="flex-row items-end gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 pb-8">
            <TextInput
              value={inputMessage}
              onChangeText={setInputMessage}
              placeholder="Mesajınızı yazın..."
              placeholderTextColor="#9ca3af"
              multiline
              className="flex-1 border border-gray-300 dark:border-gray-600 rounded-xl px-4 py-2.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white max-h-24"
            />
            <TouchableOpacity onPress={() => sendMessage()} disabled={isLoading || !inputMessage.trim()}
              className="bg-blue-600 w-10 h-10 rounded-xl items-center justify-center" style={(!inputMessage.trim() || isLoading) ? { opacity: 0.5 } : {}}>
              <Feather name="send" size={18} color="#fff" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}
