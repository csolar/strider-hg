## Mercurial provider

Allow strider to use any mercurial repository for a project. It simply consists in minor modifications to the [strider-git][1] module's code in order to support mercurial repositories.

### Config

- url
- display_url (optional)
- auth
  - ssh
    - custom priv/pubkey if you want
  - https
    - username
    - password

[1]: https://github.com/Strider-CD/strider-git