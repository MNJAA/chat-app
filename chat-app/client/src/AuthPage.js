import React from "react";
import { Auth } from "@supabase/auth-ui-react";
import { ThemeSupa } from "@supabase/auth-ui-shared";
import supabase from "./supabaseClient";

function AuthPage() {
  return (
    <div>
      <h2>Login</h2>
      <Auth
         supabaseClient={supabase}
         appearance={{ theme: ThemeSupa }}
         providers={["github"]}
         redirectTo={window.location.origin}
         showLinks={false}
         magicLink={true}
         // Enable MFA
         enableMultiFactorAuth={true}
      />
    </div>
  );
}

export default AuthPage;