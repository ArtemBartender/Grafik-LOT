import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore/lite';

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

export interface BonusEntry {
  id: string;
  comment: string;
  val: number;
  type: 'plus' | 'minus' | string;
  date: string;
  author?: string;
  rejected?: boolean;
}

export async function fetchUserBonusForMonth(fullName: string, yearMonthPrefix: string) {
  const usersCol = collection(firebaseDb, 'premie_users');
  const snapshot = await getDocs(usersCol);

  let foundData: any = null;
  snapshot.forEach(doc => {
    if (doc.data().name === fullName) {
      foundData = doc.data();
    }
  });

  if (!foundData) return { entries: [], totalPoints: 0 };

  const rawEntries: BonusEntry[] = foundData.entries || [];
  
  // Filter out rejected and match the month prefix (e.g. "2026-06")
  const validEntries = rawEntries.filter(e => !e.rejected && e.date.startsWith(yearMonthPrefix));
  const sortedEntries = validEntries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  const total = sortedEntries.reduce((acc: number, val: BonusEntry) => {
    if (val.val) {
      const num = Number(val.val);
      return val.type === 'minus' ? acc - num : acc + num;
    }
    return acc;
  }, 0);

  return { entries: sortedEntries, totalPoints: Number(total.toFixed(2)) };
}

