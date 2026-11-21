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
      className={`flex shrink-0 items-center gap-2 ${className}`}
      data-testid="account-menu"
      title={account.email}
    >
      {/* Under 360px the photo gives way, so the wordmark and Sign out fit
          the header without pushing the page wider than the screen. */}
      {account.picture ? (
        // A Google profile photo; next/image would need its host allowlisted.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={account.picture}
          alt=""
          width={28}
          height={28}
          referrerPolicy="no-referrer"
          className="size-7 rounded-full ring-1 ring-line max-[359px]:hidden"
        />
      ) : (
        <span
          aria-hidden
          className={
            "inline-flex size-7 items-center justify-center rounded-full " +
            "bg-guide font-typed text-label text-ink ring-1 ring-line " +
            "max-[359px]:hidden"
          }
        >
          {firstName.charAt(0).toUpperCase()}
        </span>
      )}
      <span
        className="hidden text-meta text-ink-2 lg:inline"
        data-testid="account-name"
      >
        {firstName}
      </span>
      <a
        href={account.signOutUrl}
        className="btn btn-quiet btn-sm min-h-11 sm:min-h-9"
        data-testid="sign-out"
      >
        Sign out
      </a>
    </div>
  );
}
