import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import notificationSound from "../assets/notification.mp3";
import EmojiPicker from "emoji-picker-react";
import DOMPurify from "dompurify";

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [userName, setUserName] = useState("");
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isTyping, setIsTyping] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [typingUsers, setTypingUsers] = useState([]);
  const navigate = useNavigate();
  const inputRef = useRef(null);

  useEffect(() => {
    // Fetch current session and user info
    async function fetchUserName() {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session || !session.user) {
        console.error("User not authenticated");
        setLoading(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user.user_metadata?.name) {
        navigate("/name");
        setLoading(false);
        return;
      }

      setUserName(user.user_metadata.name);
      setLoading(false);
    }

    // Fetch messages from the database
    async function fetchMessages() {
      const { data: messages, error } = await supabase
        .from("messages")
        .select("id, text, sender_id, created_at")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching messages:", error);
        setLoading(false);
        return;
      }

      // Map messages and include sender's name
      const messagesWithSenders = await Promise.all(
        messages.map(async (msg) => {
          const { data: { user } } = await supabase.auth.admin.getUserById(msg.sender_id);
          return {
            ...msg,
            sender: user?.user_metadata?.name || "Unknown",
            isCurrentUser: msg.sender_id === session?.user?.id,
          };
        })
      );

      setMessages(messagesWithSenders);
    }

    fetchMessages();
    fetchUserName();

    // Listen to authentication state changes (login/logout)
    const { data: { subscription: authListener } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchUserName();
    });

    // Real-time subscription for new messages (only for other users)
    const messagesSubscription = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        async (payload) => {
          const newMsg = payload.new;
          // Ignore messages sent by the current user (handled by optimistic update)
          if (newMsg.sender_id === session?.user?.id) return;

          // Play notification sound
          const audio = new Audio(notificationSound);
          audio.play().catch(() => console.log("Audio playback failed"));

          // Fetch sender's name
          const { data: { user } } = await supabase.auth.admin.getUserById(newMsg.sender_id);
          const messageWithSender = {
            ...newMsg,
            sender: user?.user_metadata?.name || "Unknown",
            isCurrentUser: newMsg.sender_id === session?.user?.id,
          };

          // Update messages state (if the message isn't already there)
          setMessages((prevMessages) => {
            const isDuplicate = prevMessages.some((msg) => msg.id === newMsg.id);
            if (!isDuplicate) {
              return [...prevMessages, messageWithSender];
            }
            return prevMessages;
          });
        }
      )
      .subscribe();

    // Presence tracking for online users
    const presenceChannel = supabase.channel("online-users", {
      config: {
        presence: {
          key: session?.user?.id,
        },
      },
    });

    presenceChannel
      .on("presence", { event: "sync" }, () => {
        const state = presenceChannel.presenceState();
        setOnlineUsers(Object.values(state).flat());
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED" && session?.user) {
          await presenceChannel.track({
            user_id: session.user.id,
            name: userName,
            last_seen: new Date().toISOString(),
          });
        }
      });

    // Typing indicators
    const typingChannel = supabase.channel("typing-indicators");

    typingChannel
      .on("broadcast", { event: "typing" }, (payload) => {
        const { user, isTyping } = payload.payload;
        setTypingUsers((prev) => {
          if (isTyping && !prev.includes(user)) {
            return [...prev, user];
          } else if (!isTyping) {
            return prev.filter((u) => u !== user);
          }
          return prev;
        });
      })
      .subscribe();

    // Cleanup listeners on component unmount
    return () => {
      authListener?.unsubscribe();
      messagesSubscription.unsubscribe();
      presenceChannel.unsubscribe();
      typingChannel.unsubscribe();
    };
  }, [navigate, session, userName]);

  // Send a new message
  async function sendMessage(e) {
    
    e.preventDefault();
    if (!newMessage.trim() || !session?.user) return;

    // Optimistically add the message to the state
    const optimisticMessage = {
      id: `temp-${Date.now()}`, // Temporary ID
      text: newMessage,
      sender_id: session.user.id,
      created_at: new Date().toISOString(),
      sender: userName,
      isCurrentUser: true,
    };

    setMessages((prevMessages) => [...prevMessages, optimisticMessage]);
    setNewMessage("");

    // Send the message to Supabase
    const { data, error } = await supabase
      .from("messages")
      .insert([{ text: newMessage, sender_id: session.user.id }])
      .select(); // Use .select() to get the inserted message

    if (error) {
      console.error("Error sending message:", error);
      // Remove the optimistic message if the send fails
      setMessages((prevMessages) =>
        prevMessages.filter((msg) => msg.id !== optimisticMessage.id)
      );
      alert("Failed to send message. Please try again.");
    } else {
      // Replace the optimistic message with the real message from Supabase
      const insertedMessage = data[0];
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.id === optimisticMessage.id
            ? { ...insertedMessage, sender: userName, isCurrentUser: true }
            : msg
        )
      );
    }
  }

  // Handle typing events
  const handleTyping = (e) => {
    setNewMessage(e.target.value);
    if (!isTyping) {
      setIsTyping(true);
      supabase.channel("typing-indicators").send({
        type: "broadcast",
        event: "typing",
        payload: { user: userName, isTyping: true },
      });
    }

    // Debounce to stop typing indicator after 2 seconds
    setTimeout(() => {
      setIsTyping(false);
      supabase.channel("typing-indicators").send({
        type: "broadcast",
        event: "typing",
        payload: { user: userName, isTyping: false },
      });
    }, 2000);
  };

  // Handle emoji selection
  const handleEmojiClick = (emoji) => {
    setNewMessage((prev) => prev + emoji.emoji);
    inputRef.current.focus();
  };

  if (loading) return <div className="loading">Loading sparkles...</div>;

  return (
    <div className="chat-container">
      <header className="chat-header">
        <h1>Chat-1p1</h1>
        <div className="header-controls">
          <div className="online-status">
            <span className="online-dot"></span>
            {onlineUsers.length} Online
          </div>
        </div>
      </header>

      <div className="messages-container">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`message ${msg.isCurrentUser ? "current-user" : ""}`}
          >
            <div className="message-header">
              <span className="sender">{msg.sender}</span>
              <span className="timestamp">
                {new Date(msg.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content"
              dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(msg.text) }}
            />
          </div>
        ))}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.join(", ")} is typing...
          </div>
        )}
      </div>

      <form onSubmit={sendMessage} className="message-form">
        <div className="emoji-picker-container">
          <button
            type="button"
            className="emoji-btn"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          >
            😊
          </button>
          {showEmojiPicker && (
            <div className="emoji-picker">
              <EmojiPicker onEmojiClick={handleEmojiClick} />
            </div>
          )}
        </div>
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder="Type your message here..."
          className="message-input"
          ref={inputRef}
        />
        <button type="submit" className="send-btn">
          Send
        </button>
      </form>
    </div>
  );
}

export default ChatPage;