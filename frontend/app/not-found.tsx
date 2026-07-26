'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();
  const [countdown, setCountdown] = useState(3); // Définition du compteur initial

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    const redirectTimeout = setTimeout(() => {
      router.push('/'); // Redirection après 3 secondes
    }, 3000);

    return () => {
      clearInterval(timer); // Nettoie le timer
      clearTimeout(redirectTimeout);
    };
  }, [router]);

  return (
    <div className="bg-background text-white font-extrabold font-family-karla h-screen w-screen flex flex-col justify-center items-center text-[2vh]">
      <h1>404 - Page Introuvable</h1>
      <p>
        Vous allez être redirigé vers la page d&apos;accueil{' '}
        {countdown >= 1 ? `dans ${countdown} seconde` : 'maintenant'}
        {countdown > 1 ? 's' : ''}...
      </p>
    </div>
  );
}
