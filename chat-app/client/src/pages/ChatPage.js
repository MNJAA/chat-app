import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";
import notificationSound from "../assets/notification.mp3";
import EmojiPicker from "emoji-picker-react";

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
  const [todos, setTodos] = useState([]);
  const [showTodoList, setShowTodoList] = useState(false);

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
        .select("id, text, read_at, sender_id, created_at")
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
            id: msg.id,
            text: msg.text,
            read_at: msg.read_at,
            sender_id: msg.sender_id,
            created_at: msg.created_at,
            sender: user?.user_metadata?.name || "Unknown",
            isCurrentUser: msg.sender_id === session?.user?.id,
          };
        })
      );
      setMessages(messagesWithSenders);
    }

    async function fetchTodos() {
      const { data: todos, error } = await supabase
        .from("todos")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) {
        console.error("Error fetching todos:", error);
        return;
      }
      setTodos(todos);
    }

    if (session?.user) {
      markMessagesAsRead();
      fetchTodos();
      fetchMessages();
      fetchUserName();
    }

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
            id: newMsg.id,
            text: newMsg.text,
            read_at: newMsg.read_at,
            sender_id: newMsg.sender_id,
            created_at: newMsg.created_at,
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

    // Real-time subscription for message deletions
    const deleteSubscription = supabase
      .channel("delete-messages")
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "messages" },
        (payload) => {
          const deletedMsgId = payload.old.id;
          setMessages((prevMessages) => prevMessages.filter((msg) => msg.id !== deletedMsgId));
        }
      )
      .subscribe();

    // Cleanup listeners on component unmount
    return () => {
      authListener?.unsubscribe();
      messagesSubscription.unsubscribe();
      presenceChannel.unsubscribe();
      typingChannel.unsubscribe();
      deleteSubscription.unsubscribe();
    };
  }, [navigate, session, userName]);

  async function addTodo(e) {
    e.preventDefault();
    const formData = new FormData(e.target);
    const task = formData.get("todo").trim();
    if (!task) return;
    const { data: newTodo, error } = await supabase
      .from("todos")
      .insert([{ task, created_by: session.user.id }])
      .select();
    if (error) {
      console.error("Error adding todo:", error);
    } else {
      setTodos((prevTodos) => [...prevTodos, newTodo[0]]);
      e.target.reset();
    }
  }

  async function toggleTodoCompletion(todoId) {
    const todo = todos.find((t) => t.id === todoId);
    const { error } = await supabase
      .from("todos")
      .update({ completed: !todo.completed })
      .eq("id", todoId);
    if (error) {
      console.error("Error updating todo:", error);
    } else {
      setTodos((prevTodos) =>
        prevTodos.map((t) =>
          t.id === todoId ? { ...t, completed: !t.completed } : t
        )
      );
    }
  }

  async function deleteTodo(todoId) {
    const { error } = await supabase
      .from("todos")
      .delete()
      .eq("id", todoId);
    if (error) {
      console.error("Error deleting todo:", error);
    } else {
      setTodos((prevTodos) => prevTodos.filter((t) => t.id !== todoId));
    }
  }

  // Send a new message
  async function sendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !session?.user) return;
    // Optimistically add the message to the state
    const tempId = `temp-${Date.now()}`; // Temporary ID
    const optimisticMessage = {
      id: tempId, // Temporary ID
      text: newMessage,
      sender_id: session.user.id,
      created_at: new Date().toISOString(),
      sender: userName,
      isCurrentUser: true,
      tempId, // Store the temporary ID for later replacement
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
        prevMessages.filter((msg) => msg.tempId !== tempId)
      );
      alert("Failed to send message. Please try again.");
    } else {
      // Replace the optimistic message with the real message from Supabase
      const insertedMessage = data[0];
      setMessages((prevMessages) =>
        prevMessages.map((msg) =>
          msg.tempId === tempId
            ? {
                id: insertedMessage.id,
                text: insertedMessage.text,
                read_at: insertedMessage.read_at,
                sender_id: insertedMessage.sender_id,
                created_at: insertedMessage.created_at,
                sender: userName,
                isCurrentUser: true,
              }
            : msg
        )
      );
    }
  }

  // Mark messages as read
  async function markMessagesAsRead() {
    const { error } = await supabase
      .from("messages")
      .update({ read_at: new Date().toISOString() })
      .eq("sender_id", session.user.id) // Messages sent by you
      .is("read_at", null); // Only mark unread messages
    if (error) {
      console.error("Error marking messages as read:", error);
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

  if (loading) return <div>Loading...</div>;

  return (
    <div className="chat-container">
      <div className="chat-header">
        <h1>Chat-1p1</h1>
        <div className="header-controls">
          <div className="online-status">
            <span className="online-dot"></span>
            {onlineUsers.length} Online
          </div>
          <button onClick={() => setShowTodoList(!showTodoList)} className="todo-toggle-btn">
            {showTodoList ? "Hide To-Do List" : "Show To-Do List"}
          </button>
        </div>
      </div>
      {showTodoList && (
        <div className="todo-sidebar">
          <h2>Shared To-Do List</h2>
          <ul className="todo-list">
            {todos.map((todo) => (
              <li key={todo.id} className="todo-item">
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodoCompletion(todo.id)}
                />
                <span className={todo.completed ? "completed" : ""}>{todo.task}</span>
                <button onClick={() => deleteTodo(todo.id)} className="delete-todo-btn">
                  🗑️
                </button>
              </li>
            ))}
          </ul>
          <form onSubmit={addTodo} className="add-todo-form">
            <input type="text" name="todo" placeholder="Add a new task" className="todo-input" />
            <button type="submit" className="add-todo-btn">Add</button>
          </form>
        </div>
      )}
      <div className="messages-container">
        {messages.map((msg) => (
          <div key={msg.id} className={`message ${msg.isCurrentUser ? "current-user" : ""}`}>
            <div className="message-header">
              <span className="sender">{msg.sender}</span>
              <span className="timestamp">{new Date(msg.created_at).toLocaleTimeString()}</span>
            </div>
            <div className="message-content">{msg.text}</div>
            {msg.isCurrentUser && msg.read_at && (
              <div className="read-receipt">Seen at {new Date(msg.read_at).toLocaleTimeString()}</div>
            )}
          </div>
        ))}
        {typingUsers.length > 0 && (
          <div className="typing-indicator">
            {typingUsers.join(", ")} is typing...
            <div className="typing-dots">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
      </div>
      <div className="message-form">
        <button onClick={() => setShowEmojiPicker(!showEmojiPicker)} className="emoji-btn">
          😊
        </button>
        {showEmojiPicker && (
          <div className="emoji-picker-container">
            <EmojiPicker onEmojiClick={handleEmojiClick} />
          </div>
        )}
        <input
          type="text"
          value={newMessage}
          onChange={handleTyping}
          ref={inputRef}
          className="message-input"
          placeholder="Type a message..."
        />
        <button onClick={sendMessage} className="send-btn">
          Send
        </button>
      </div>
    </div>
  );
}

export default ChatPage;