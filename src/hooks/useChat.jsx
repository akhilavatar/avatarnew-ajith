import { createContext, useContext, useEffect, useState } from "react";
import axios from "axios";
import { useContentStore } from "../store/content";
import { useNavigate } from "react-router-dom";

const backendUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
const ELEVEN_LABS_API_KEY = "sk_1bf26f5f2ac6e9712644981e24fa71e9ee1ed7178fd885e7";
const VOICE_ID = "xctasy8XvGp2cVO9HL9k";

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { setContentType } = useContentStore();
  const navigate = useNavigate();
  const [chatHistory, setChatHistory] = useState([]);
  
  const synthesizeSpeech = async (text) => {
    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': ELEVEN_LABS_API_KEY
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.5
          }
        })
      });

      const blob = await response.blob();
      return URL.createObjectURL(blob);
    } catch (error) {
      console.error('Speech synthesis failed:', error);
      return null;
    }
  };

  const chat = async (message) => {
    setLoading(true);
    try {
      // Add user message to chat history
      setChatHistory(prev => [...prev, { role: 'user', content: message }]);

      // Handle search queries
      if (message.toLowerCase().includes('search') || message.toLowerCase().includes('find')) {
        const searchTerm = message.replace(/search|find|for/gi, '').trim();
        
        // Try searching in movies first
        const movieRes = await axios.get(`/api/v1/search/movie/${searchTerm}`);
        if (movieRes.data.content.length > 0) {
          setContentType('movie');
          const content = movieRes.data.content[0];
          const response = `I found "${content.title}". Would you like to watch it?`;
          
          // Generate speech for the response
          const audioUrl = await synthesizeSpeech(response);
          
          setMessages([{
            text: response,
            searchResult: content,
            type: 'movie',
            audio: audioUrl
          }]);
          
          // Add response to chat history
          setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
          
          return;
        }

        // If no movies found, try TV shows
        const tvRes = await axios.get(`/api/v1/search/tv/${searchTerm}`);
        if (tvRes.data.content.length > 0) {
          setContentType('tv');
          const content = tvRes.data.content[0];
          const response = `I found "${content.name}". Would you like to watch it?`;
          
          // Generate speech for the response
          const audioUrl = await synthesizeSpeech(response);
          
          setMessages([{
            text: response,
            searchResult: content,
            type: 'tv',
            audio: audioUrl
          }]);
          
          // Add response to chat history
          setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
          
          return;
        }

        const notFoundResponse = "I couldn't find any movies or TV shows matching your search. Please try a different search term.";
        const audioUrl = await synthesizeSpeech(notFoundResponse);
        
        setMessages([{
          text: notFoundResponse,
          audio: audioUrl
        }]);
        
        // Add response to chat history
        setChatHistory(prev => [...prev, { role: 'assistant', content: notFoundResponse }]);
        
        return;
      }

      // If it's a "yes" response to watching content
      if (message.toLowerCase().includes('yes') && messages[0]?.searchResult) {
        const content = messages[0].searchResult;
        const response = `Great! Taking you to watch ${content.title || content.name}.`;
        const audioUrl = await synthesizeSpeech(response);
        
        setMessages([{
          text: response,
          audio: audioUrl
        }]);
        
        // Add response to chat history
        setChatHistory(prev => [...prev, { role: 'assistant', content: response }]);
        
        navigate(`/watch/${content.id}`);
        return;
      }

      // Default chat response
      const data = await fetch(`${backendUrl}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      });
      const resp = (await data.json()).messages;
      
      // Generate speech for each message
      const messagesWithAudio = await Promise.all(
        resp.map(async (msg) => ({
          ...msg,
          audio: await synthesizeSpeech(msg.text)
        }))
      );
      
      setMessages((messages) => [...messages, ...messagesWithAudio]);
      
      // Add responses to chat history
      setChatHistory(prev => [
        ...prev,
        ...messagesWithAudio.map(msg => ({
          role: 'assistant',
          content: msg.text
        }))
      ]);
      
    } catch (error) {
      const errorMessage = "I'm sorry, I encountered an error. Please try again.";
      const audioUrl = await synthesizeSpeech(errorMessage);
      
      setMessages([{
        text: errorMessage,
        audio: audioUrl
      }]);
      
      // Add error response to chat history
      setChatHistory(prev => [...prev, { role: 'assistant', content: errorMessage }]);
      
    } finally {
      setLoading(false);
    }
  };

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState();
  const [loading, setLoading] = useState(false);
  const [cameraZoomed, setCameraZoomed] = useState(true);
  
  const onMessagePlayed = () => {
    setMessages((messages) => messages.slice(1));
  };

  useEffect(() => {
    if (messages.length > 0) {
      setMessage(messages[0]);
    } else {
      setMessage(null);
    }
  }, [messages]);

  return (
    <ChatContext.Provider
      value={{
        chat,
        message,
        onMessagePlayed,
        loading,
        cameraZoomed,
        setCameraZoomed,
        chatHistory
      }}
    >
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within a ChatProvider");
  }
  return context;
};