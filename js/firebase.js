<script type="module">

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-analytics.js";

const firebaseConfig = {
  apiKey: "AIzaSyDFyo49uQEhRHVTxK9LPmG1AcwgeIZYphk",
  authDomain: "vmc2026-3b10b.firebaseapp.com",
  projectId: "vmc2026-3b10b",
  storageBucket: "vmc2026-3b10b.appspot.com",
  messagingSenderId: "88307042345",
  appId: "1:88307042345:web:3530ac98c4a6aaa3767438",
  measurementId: "G-PY1EZJW2HE"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

const analytics = getAnalytics(app);

</script>