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

const publicAnalyticsPages = {
	'/': 'ZenWriter — Free Online Journal'
};
const analyticsDisableKey = `ga-disable-${firebaseConfig.measurementId}`;
let analyticsNavigation = 0;
let previousPublicPage = '';
let analyticsInstance;

export function disableAnalytics() {
	if (typeof window === 'undefined') return;
	analyticsNavigation += 1;
	// Apply synchronously, before navigation changes the URL or private document title.
	window[analyticsDisableKey] = true;
}

function analyticsReferrer() {
	if (previousPublicPage) return previousPublicPage;
	try {
		const referrer = new URL(document.referrer);
		if (referrer.origin === window.location.origin) {
			return Object.hasOwn(publicAnalyticsPages, referrer.pathname)
				? `https://zenwriter.live${referrer.pathname}` : '';
		}
		return `${referrer.origin}${referrer.pathname}`;
	} catch {
		return '';
	}
}

export async function initAnalytics() {
	if (typeof window === 'undefined') return;
	const pathname = window.location.pathname;
	if (!Object.hasOwn(publicAnalyticsPages, pathname)) {
		disableAnalytics();
		return;
	}
	const navigation = analyticsNavigation;
	window[analyticsDisableKey] = true;
	const { initializeAnalytics, isSupported, logEvent } = await import('firebase/analytics');
	if (!(await isSupported())) return;
	if (navigation !== analyticsNavigation || window.location.pathname !== pathname) return;
	analyticsInstance ??= initializeAnalytics(firebaseApp, {
		config: {
			send_page_view: false,
			// Automatic events must never read a journal title, document ID, or URL query.
			page_title: 'ZenWriter',
			page_location: 'https://zenwriter.live/',
			page_referrer: ''
		}
	});
	const pageLocation = `https://zenwriter.live${pathname}`;
	window[analyticsDisableKey] = false;
	logEvent(analyticsInstance, 'page_view', {
		page_title: publicAnalyticsPages[pathname],
		page_location: pageLocation,
		page_referrer: analyticsReferrer()
	});
	previousPublicPage = pageLocation;
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
