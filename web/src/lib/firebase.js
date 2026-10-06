import { initializeApp } from 'firebase/app';

const firebaseConfig = {
	apiKey: 'AIzaSyDDlc9edSgQrshtBBHD66V_5OhngUjx6oU',
	authDomain: 'zenwriter-f24c8.firebaseapp.com',
	projectId: 'zenwriter-f24c8',
	storageBucket: 'zenwriter-f24c8.firebasestorage.app',
	messagingSenderId: '246635196723',
	appId: '1:246635196723:web:3b231159b96e9129998e46',
	measurementId: 'G-Z6977W5P03'
};

export const firebaseApp = initializeApp(firebaseConfig);

export async function initAnalytics() {
	const { getAnalytics, isSupported } = await import('firebase/analytics');
	if (!(await isSupported())) return;
	getAnalytics(firebaseApp);
}

export async function sendFeedback(message, email = '') {
	const text = message.trim();
	if (!text || text.length > 2000) throw new Error('Write a short note first.');
	if (typeof email !== 'string') throw new Error('Enter a valid email address.');
	const contactEmail = email.trim();
	if (contactEmail && (contactEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail))) {
		throw new Error('Enter a valid email address.');
	}
	const { getFirestore, addDoc, collection, serverTimestamp } = await import('firebase/firestore');
	const db = getFirestore(firebaseApp);
	await addDoc(collection(db, 'feedback'), {
		message: text,
		createdAt: serverTimestamp(),
		...(contactEmail ? { email: contactEmail } : {})
	});
}
