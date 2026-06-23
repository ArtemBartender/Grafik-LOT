import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyCa7HuraZ2O0p_Nhta2mMAx4GNGHrxd-eI",
  authDomain: "rappo-8ed6a.firebaseapp.com",
  projectId: "rappo-8ed6a",
  storageBucket: "rappo-8ed6a.firebasestorage.app",
  messagingSenderId: "880888014436",
  appId: "1:880888014436:web:5f60cda595d8b84bd56171"
};

const app = initializeApp(firebaseConfig);
const dbRef = ref(getDatabase(app));

get(dbRef).then((snapshot) => {
  if (snapshot.exists()) {
    console.log(Object.keys(snapshot.val()));
    console.log(JSON.stringify(snapshot.val()).substring(0, 500));
  } else {
    console.log("No data available");
  }
}).catch((error) => {
  console.error(error);
});
