import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection } from "firebase/firestore/lite";

const firebaseConfig = {
  apiKey: "AIzaSyCa7HuraZ2O0p_Nhta2mMAx4GNGHrxd-eI",
  authDomain: "rappo-8ed6a.firebaseapp.com",
  projectId: "rappo-8ed6a",
  storageBucket: "rappo-8ed6a.firebasestorage.app",
  messagingSenderId: "880888014436",
  appId: "1:880888014436:web:5f60cda595d8b84bd56171"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const toTest = [
  "pracownicy", "premia", "premie", "plus_minus", "premii", "grafik", "ratings", "zametki",
  "Oceny", "oceny", "Points", "points", "Scores", "scores", "Waiters", "waiter", "oficy", "ofiki"
];

async function test() {
  for (const c of toTest) {
    try {
      const snap = await getDocs(collection(db, c));
      if (snap.size > 0) {
        console.log(`FOUND: ${c} -> ${snap.size}`);
        console.log(snap.docs[0].id, snap.docs[0].data());
      }
    } catch(e) {
      console.log(`error over ${c}: ${e.message}`);
    }
  }
}
test();
