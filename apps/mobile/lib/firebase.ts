import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: "AIzaSyDGFLkyAobSV3tsn7jfdmbzJLvAEAYi5C4",
  authDomain: "lasahub.firebaseapp.com",
  projectId: "lasahub",
  storageBucket: "lasahub.firebasestorage.app",
  messagingSenderId: "703565605737",
  appId: "1:703565605737:web:d611fc80b1961028326bf8",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
export const auth = getAuth(app);
