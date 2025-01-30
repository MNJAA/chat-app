import React, { useState, useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import supabase from "./supabaseClient";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");

  useEffect(() => {
    fetchMessages();

    // Get the current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    // Listen for authentication state changes
    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    // Real-time messages subscription
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          setMessages((prevMessages) => {
            // Ensure no duplicate messages
            if (!prevMessages.some((msg) => msg.id === payload.new.id)) {
              return [...prevMessages, payload.new];
            }
            return prevMessages;
          });
        }
      )
      .subscribe();

    // Cleanup function
    return () => {
      channel.unsubscribe();
      authListener?.subscription?.unsubscribe();
    };
  }, []);

  // Fetch messages from Supabase
  async function fetchMessages() {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching messages:", error);
    } else {
      setMessages(data);
    }
  }

  // Send a new message
  async function sendMessage(e) {
    e.preventDefault();
    if (!newMessage.trim() || !session) return;

    const { user } = session;
    const { error } = await supabase.from("messages").insert([
      {
        text: newMessage,
        sender_id: user.id,
      },
    ]);

    if (!error) {
      setNewMessage("");
    } else {
      console.error("Error sending message:", error);
    }
  }

  // Logout user
  async function handleLogout() {
    await supabase.auth.signOut();
    setSession(null);
  }

  return (
    <div className="chat-container">
      {!session ? (
        <div>
          <h2>Login</h2>
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={["github"]}
          />
        </div>
      ) : (
        <>
          <h2>Chat</h2>
          <button onClick={handleLogout}>Logout</button>
          <div className="messages">
            {messages.map((msg) => (
              <p key={msg.id}>{msg.text}</p>
            ))}
          </div>
          <form onSubmit={sendMessage}>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message..."
            />
            <button type="submit">Send</button>
          </form>
        </>
      )}
    </div>
  );
}

export default App;
