import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import notificationSound from "../assets/notification.mp3";
import EmojiPicker from "emoji-picker-react";

const ChatPage = () => {
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
    const initializeChat = async () => {
      try {
        // Fetch session and user info
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        if (!activeSession || !activeSession.user) {
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

        setSession(activeSession);
        setUserName(user.user_metadata.name);

        // Fetch messages
        const { data: fetchedMessages, error } = await supabase
          .from("messages")
          .select("*")
          .order("created_at", { ascending: true });

        if (error) throw new Error(`Error fetching messages: ${error.message}`);

        setMessages(
          fetchedMessages.map((msg) => ({
            ...msg,
            sender: msg.sender_name || "Unknown",
            isCurrentUser: msg.sender_id === activeSession.user.id,
          }))
        );

        // Real-time subscription for new messages
        const messagesSubscription = supabase
          .channel("messages")
          .on(
            "postgres_changes",
            { event: "INSERT", schema: "public", table: "messages" },
            (payload) => {
              console.log("Realtime payload:", payload); // Log the payload

              const newMsg = payload.new;

              // Skip messages sent by the current user (already handled optimistically)
              if (newMsg.sender_id === activeSession.user.id) return;

              const audio = new Audio(notificationSound);
              audio.play().catch(() => console.log("Audio playback failed"));

              // Add the new message to the state
              const messageWithSender = {
                ...newMsg,
                sender: newMsg.sender_name || "Unknown",
                isCurrentUser: false,
              };

              setMessages((prev) => {
                const isDuplicate = prev.some((msg) => msg.id === newMsg.id);
                return isDuplicate ? prev : [...prev, messageWithSender];
              });
            }
          )
          .subscribe();

        // Presence tracking for online users
        const presenceChannel = supabase.channel("online-users", {
          config: {
            presence: {
              key: activeSession.user.id,
            },
          },
        });

        presenceChannel
          .on("presence", { event: "sync" }, () => {
            const state = presenceChannel.presenceState();
            setOnlineUsers(Object.values(state).flat());
          })
          .subscribe(async (status) => {
            if (status === "SUBSCRIBED") {
              await presenceChannel.track({
                user_id: activeSession.user.id,
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
            setTypingUsers((prev) =>
              isTyping && !prev.includes(user)
                ? [...prev, user]
                : prev.filter((u) => u !== user)
            );
          })
          .subscribe();

        return () => {
          messagesSubscription.unsubscribe();
          presenceChannel.unsubscribe();
          typingChannel.unsubscribe();
        };
      } catch (error) {
        console.error("Error initializing chat:", error);
      } finally {
        setLoading(false);
      }
    };

    const handleWebSocketEvents = () => {
      supabase.channel("messages").on("system", (event) => {
        console.log("WebSocket system event:", event);
      });

      supabase.channel("messages").on("error", (error) => {
        console.error("WebSocket error:", error);
      });

      supabase.channel("messages").on("close", () => {
        console.warn("WebSocket connection closed");
      });
    };

    initializeChat();
    handleWebSocketEvents();
  }, [navigate, session]);

  const sendMessage = async (e) => {
    e.preventDefault();

    if (!newMessage.trim() || !session?.user) return;

    const tempId = `temp-${Date.now()}`;
    const optimisticMessage = {
      id: tempId,
      text: newMessage,
      sender_id: session.user.id,
      created_at: new Date().toISOString(),
      sender: userName,
      sender_name: userName,
      isCurrentUser: true,
      tempId,
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setNewMessage("");

    try {
      const { data, error } = await supabase
        .from("messages")
        .insert([{ text: newMessage, sender_id: session.user.id, sender_name: userName }])
        .select();

      if (error) throw new Error(`Error sending message: ${error.message}`);

      const insertedMessage = data[0];
      setMessages((prev) =>
        prev.map((msg) =>
          msg.tempId === tempId
            ? { ...insertedMessage, sender: userName, isCurrentUser: true }
            : msg
        )
      );
    } catch (error) {
      console.error(error);
      alert("Failed to send message. Please try again.");
      setMessages((prev) => prev.filter((msg) => msg.tempId !== tempId));
    }
  };

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

    setTimeout(() => {
      setIsTyping(false);
      supabase.channel("typing-indicators").send({
        type: "broadcast",
        event: "typing",
        payload: { user: userName, isTyping: false },
      });
    }, 2000);
  };

  const handleEmojiClick = (emoji) => {
    setNewMessage((prev) => prev + emoji.emoji);
    inputRef.current.focus();
  };

  if (loading) return <div>Loading sparkles...</div>;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Chat-1p1</h1>
        <div className="header-controls">
          <div className="online-status">
            <span className="online-dot"></span>
            {onlineUsers.length} Online
          </div>
          <button className="logout-btn">Logout</button>
        </div>
      </div>
      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.isCurrentUser ? "current-user" : ""}`}>
            <div className="message-header">
              <span className="sender">{msg.sender}</span>
              <span className="timestamp">
                {new Date(msg.created_at).toLocaleTimeString()}
              </span>
            </div>
            <div className="message-content">{msg.text}</div>
            {msg.isCurrentUser && msg.read_at && (
              <div className="seen-status">
                Seen at {new Date(msg.read_at).toLocaleTimeString()}
              </div>
            )}
          </div>
        ))}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.join(", ")} is typing...
          </div>
        )}
      </div>
      <form className="message-form" onSubmit={sendMessage}>
        <button
          type="button"
          className="emoji-btn"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
        >
          😊
        </button>
        {showEmojiPicker && <EmojiPicker onEmojiClick={handleEmojiClick} />}
        <input
          ref={inputRef}
          type="text"
          value={newMessage}
          onChange={handleTyping}
          placeholder="Type a message..."
          className="message-input"
        />
        <button type="submit" className="send-btn">
          Send
        </button>
      </form>
    </div>
  );
};

export default ChatPage;