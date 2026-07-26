import Link from 'next/link';

const sidebarItems = [
  {
    name: 'Se connecter',
    href: 'login',
  },
  {
    name: 'Accueil',
    href: '/home',
  },
  {
    name: 'Audits en cours',
    href: '/current-audits',
  },
  {
    name: "Edition d'un audit",
    href: '/current-audits/fsjjdhfks/edit',
  },
  {
    name: 'Audits terminés',
    href: '/finished-audits',
  },
  {
    name: 'Gestion des accès',
    href: '/admin/accounts',
  },
  {
    name: 'Créer un utilisateur',
    href: '/admin/create-account',
  },
  {
    name: 'Ajouter un auditeur à un audit',
    href: '/audit',
  },
];

export default function LandingPage() {
  return (
    <div className="h-screen w-full flex relative bg-background">
      <aside className="h-full bg-sidebar p-4 absolute right-0 overflow-y-scroll auditbar">
        <div className="w-max-content flex items-center gap-4 pb-4 mb-4 border-b border-gray-300">
          <p
            className="
          text-white
            text-text2 
            text-base
            font-bold
            text-center
            tracking-tight
            text-shadow
            "
          >
            {' '}
            Les différentes pages créées
          </p>
        </div>
        <ul className="list-none">
          {sidebarItems.map(({ name, href }) => (
            <li className="text-center items-center justify-center" key={name}>
              <Link
                href={href}
                className="text-xs no-underline text-black py-2 px-4 flex items-center bg-buttonSidebar mb-4 rounded-lg transition duration-300 hover:bg-orange hover:text-white focus:bg-orange focus:text-white justify-center"
              >
                <span className="items-center justify-center">{name}</span>
              </Link>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
