import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore/lite';

const firebaseConfig = {
  apiKey: "AIzaSyCa7HuraZ2O0p_Nhta2mMAx4GNGHrxd-eI",
  authDomain: "rappo-8ed6a.firebaseapp.com",
  projectId: "rappo-8ed6a",
  storageBucket: "rappo-8ed6a.firebasestorage.app",
  messagingSenderId: "880888014436",
  appId: "1:880888014436:web:5f60cda595d8b84bd56171"
};

const app = initializeApp(firebaseConfig);
export const firebaseDb = getFirestore(app);
