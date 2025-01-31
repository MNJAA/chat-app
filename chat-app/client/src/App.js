import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import supabase from "./supabaseClient";
import AuthPage from "./AuthPage";
import NameEntryPage from "./pages/NameEntryPage";
import ChatPage from "./pages/ChatPage";
import "./App.css";



function App() {
  const [session, setSession] = useState(null);
  const [userName, setUserName] = useState("");
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    // Get current session from supabase
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) fetchUserName(session.user);
      else setLoading(false); // If no session, stop loading
    });

    // Listen for session changes
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) fetchUserName(session.user);
      else setLoading(false); // If no session, stop loading
    });
  }, []);
 
  async function fetchUserName(user) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error("Error fetching user:" + error.message);

      const fetchedName = data.user?.user_metadata?.name || "";
      setUserName(fetchedName);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false); // Ensure loading is set to false when done
    }
  }

  async function requestNotificationPermission() {
    if ("Notification" in window) {
      const permission = await Notification.requestPermission();
      if (permission === "granted") {
        setNotificationsEnabled(true);
      }
    }
  }

  return (
    <Router>
      <div className="chat-container">
        {!notificationsEnabled && (
          <button className="notification-btn" onClick={requestNotificationPermission}>
            Enable Notifications
          </button>
        )}

        {loading ? (
          <p>Loading...</p>
        ) : (
          <Routes>
            <Route
              path="/"
              element={!session ? <AuthPage /> : userName ? <Navigate to="/chat" /> : <Navigate to="/name" />}
            />
            <Route path="/name" element={session ? <NameEntryPage /> : <Navigate to="/" />} />
            <Route path="/chat" element={session && userName ? <ChatPage /> : <Navigate to="/" />} />
          </Routes>
        )}
      </div>
    </Router>
  );
}

export default App;