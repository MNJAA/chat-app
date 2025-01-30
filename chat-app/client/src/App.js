import React, { useState, useEffect } from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import supabase from "./supabaseClient";
import "./App.css";




function showNotification(message, senderId) {
  if (Notification.permission === "granted") {
    new Notification("New Message", {
      body: message,
      icon: "/chat-icon.png",
      vibrate: [200, 100, 200], // Vibrate on mobile
    });

    const audio = new Audio("/notification.mp3");
    audio.play();
  }
}




function App() {
  const [session, setSession] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  useEffect(() => {
    fetchMessages();

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
      }
    );

    const subscription = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages" },
        (payload) => {
          console.log("New message received:", payload.new);
          setMessages((prevMessages) => [...prevMessages, payload.new]);

          if (notificationsEnabled && payload.new.sender_id !== session?.user?.id) {
            showNotification(payload.new.text, payload.new.sender_id);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(subscription);
    };
  }, [notificationsEnabled]); // Reacts to notification permission change

  function requestNotificationPermission() {
    if ("Notification" in window) {
      Notification.requestPermission().then((permission) => {
        if (permission === "granted") {
          setNotificationsEnabled(true);
          console.log("Notification permission granted.");
        } else {
          console.log("Notification permission denied.");
        }
      });
    }
  }


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
    <div>

      <div className="chat-container">
        {/* Move the button outside the login check so it always appears */}
        {!notificationsEnabled && (
          <button className="notification-btn" onClick={requestNotificationPermission}>
            Enable Notifications
          </button>
        )}

        {!session ? (
          <div>
            <h2>Login</h2>
            <Auth supabaseClient={supabase} appearance={{ theme: ThemeSupa }} />
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
    </div>
  );
}

export default App;
