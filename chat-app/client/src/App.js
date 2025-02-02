import React, { useState, useEffect } from "react";
import { BrowserRouter as Router, Route, Routes, Navigate } from "react-router-dom";
import supabase from "./supabaseClient";
import AuthPage from "./AuthPage";
import NameEntryPage from "./pages/NameEntryPage";
import ChatPage from "./pages/ChatPage";
import "./App.css";

function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeAuth = async () => {
      try {
        const { data: { session: activeSession } } = await supabase.auth.getSession();
        setSession(activeSession);

        if (activeSession?.user) {
          await fetchUserName(activeSession.user);
        }
      } catch (error) {
        console.error("Error initializing auth:", error);
      } finally {
        setLoading(false);
      }

      const { data: authListener } = supabase.auth.onAuthStateChange(async (_event, activeSession) => {
        setSession(activeSession);

        if (activeSession?.user) {
          await fetchUserName(activeSession.user);
        }
      });

      return () => {
        authListener.subscription.unsubscribe();
      };
    };

    initializeAuth();
  }, []);

  const fetchUserName = async (user) => {
    try {
      const { error } = await supabase.auth.getUser();
      if (error) throw new Error(`Error fetching user: ${error.message}`);
    } catch (error) {
      console.error(error);
    }
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <Routes>
        {session ? (
          <>
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/name" element={<NameEntryPage />} />
            <Route path="/" element={<Navigate to="/chat" />} />
          </>
        ) : (
          <>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/" element={<Navigate to="/auth" />} />
          </>
        )}
      </Routes>
    </Router>
  );
}

export default App;