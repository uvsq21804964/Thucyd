/* eslint-disable react/no-unescaped-entities */
import Image from 'next/image';
import Link from 'next/link';
import Button from '@/components/Button';

const AccessDenied = () => {
  return (
    <div
      className="
          flex
          min-h-full
          flex-col
          justify-center
          py-12
          sm:px-6
          lg:px-8
        "
    >
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Image
          className="mx-auto w-auto"
          src="/images/LogoBlancIMT.png"
          alt="Logo"
          width="160"
          height="160"
        />
        <h2
          className="
              mt-6
              text-center
              text-3xl
              font-bold
              tracking-tight
              text-white
            "
        >
          L'accès à cette page est réservé aux administrateurs
        </h2>
      </div>
      <div
        className="
        mt-8
        sm:mx-auto
        sm:w-full
        sm:max-w-md
        "
      >
        <div
          style={{ borderRadius: '0.5rem' }}
          className="
        px-4
        py-8
        sm:px-10"
        >
          <Link href="/sign-up">
            <Button fullWidth border shadow>
              Retourner à la page d'accueil
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default AccessDenied;
