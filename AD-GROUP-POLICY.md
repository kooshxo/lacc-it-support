# AD access and desktop shortcut rollout

This runbook is ready for an authorized domain administrator with access to Group Policy Management (GPMC), either on an approved domain-joined admin workstation with RSAT or through an approved Windows Server session. It does not require the web app to have Active Directory credentials.

## Regain an approved management session

Use the server's hostname or fully qualified domain name while connected to the LACC network or approved VPN. For a domain account, try `DOMAIN\\username` or the account's UPN. A valid password alone does not grant Remote Desktop rights: the account must be permitted to log on through Remote Desktop, the host must allow RDP, and network policy/firewall must permit the connection. If those checks fail, use an approved admin workstation or ask the domain administrator to restore the proper RDP group/policy. Do not expose RDP to the public internet or place credentials in the app.

## Publish the employee shortcut

Wait until the LACC app's production URL, Microsoft sign-in, and ticket intake have been approved and verified. Then pilot the shortcut before broad rollout.

1. In GPMC, create a GPO named `LACC Support Portal Shortcut` and link it to the pilot **user** OU or an approved pilot user group scope.
2. Edit **User Configuration → Preferences → Windows Settings → Shortcuts** and create a shortcut with action **Update**, name `LACC IT Support`, location **Desktop**, target type **URL**, and target the verified production request URL.
3. Security-filter the policy to the approved employee group. Keep the link away from the Domain Controllers OU.
4. On a pilot workstation, refresh policy and confirm the shortcut opens the sign-in page and request form. Confirm an ordinary employee cannot access IT administration pages.
5. After approval, expand the GPO link or security filter to the intended employee population and monitor policy application.

The shortcut should contain only the public app URL. It must not contain usernames, passwords, access tokens, or a pre-authenticated link.
