import { initializeApp } from "firebase/app";
import { getFirestore, getDocs, collection } from "firebase/firestore/lite"; // USE LITE

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

async function test() {
  try {
     const asd = await getDocs(collection(db, "users"));
     console.log("users size:", asd.size);
     asd.docs.slice(0, 5).forEach(doc => console.log(doc.id, doc.data()));
     process.exit(0);
  } catch(e) {
     console.error(e);
     process.exit(1);
  }
}
test();
