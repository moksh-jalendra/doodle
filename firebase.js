const { initializeApp } = require("firebase/app");
const { getFirestore, doc, setDoc, getDoc } = require("firebase/firestore");

const firebaseConfig = {
  apiKey: "AIzaSyArij1s_ve3YItbf6c_5VJA-9SA4-Eq1xU",
  authDomain: "doodle-f45ca.firebaseapp.com",
  projectId: "doodle-f45ca",
  storageBucket: "doodle-f45ca.firebasestorage.app",
  messagingSenderId: "425937033315",
  appId: "1:425937033315:web:4fded010854ab367aa4056"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

module.exports = { db, doc, setDoc, getDoc };