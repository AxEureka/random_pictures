"use strict";

// Supabase 接続設定
const SUPABASE_URL = "https://kijjzcumcukwcjzispbk.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_5R_eYHybs7N-DuwlAcXUPQ_3zBt28Fv";

// Supabase クライアントを作成
window.supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY
);

console.log("Supabaseクライアントを初期化しました");
