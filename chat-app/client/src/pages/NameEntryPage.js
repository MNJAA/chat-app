import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import supabase from "../supabaseClient";

function NameEntryPage() {
  const [userName, setUserName] = useState("");
  const navigate = useNavigate();

  async function saveUserName() {
    if (!userName.trim()) {
      alert("Please enter a name before continuing.");
      return;
    }

    const { error } = await supabase.auth.updateUser({
      data: { name: userName.trim() },
    });

    if (error) {
      console.error("Error saving name:", error);
    } else {
      navigate("/chat");
    }
  }

  return (
    <div>
      <h2>Enter Your Name</h2>
      <input
        type="text"
        placeholder="Enter your name"
        value={userName}
        onChange={(e) => setUserName(e.target.value)}
      />
      <button onClick={saveUserName}>Save Name</button>
    </div>
  );
}

export default NameEntryPage;