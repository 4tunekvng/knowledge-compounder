export interface Account {
  name: string;
  email: string;
  picture: string;
  signOutUrl: string;
}

/** Who is signed in (photo, first name) and the way out. */
export function AccountMenu({
  account,
  className = "",
}: {
  account: Account;
  className?: string;
}) {
  const label = account.name || account.email;
  const firstName = label.split(/\s+/)[0];
  return (
    <div
      className={`flex items-center gap-2 text-sm shrink-0 ${className}`}
      data-testid="account-menu"
      title={account.email}
    >
      {account.picture ? (
        // A Google profile photo; next/image would need its host allowlisted.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={account.picture}
          alt=""
          width={24}
          height={24}
          referrerPolicy="no-referrer"
          className="h-6 w-6 rounded-full"
        />
      ) : (
        <span
          aria-hidden
          className={
            "inline-flex h-6 w-6 items-center justify-center rounded-full " +
            "text-xs"
          }
          style={{ background: "var(--accent)", color: "var(--background)" }}
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
      )}
      <span className="hidden sm:inline" data-testid="account-name">
        {firstName}
      </span>
      <a
        href={account.signOutUrl}
        className="text-[color:var(--muted)] hover:text-[color:var(--accent)]"
        data-testid="sign-out"
      >
        Sign out
      </a>
    </div>
  );
}
