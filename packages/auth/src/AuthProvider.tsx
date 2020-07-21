import React from 'react'

import type {
  AuthClient,
  SupportedAuthTypes,
  SupportedAuthClients,
  SupportedUserMetadata,
} from './authClients'
import { createAuthClient } from './authClients'

export interface CurrentUser {}

export interface AuthContextInterface {
  /* Determining your current authentication state */
  loading: boolean
  isAuthenticated: boolean
  /* The current user data from the `getCurrentUser` function on the api side */
  currentUser: null | CurrentUser
  /* The user's metadata from the auth provider */
  userMetadata: null | SupportedUserMetadata
  logIn(): Promise<void>
  logOut(): Promise<void>
  getToken(): Promise<null | string>
  /* Fetches the "currentUser" from the api side, but does not update the current user state. */
  getCurrentUser(): Promise<null | CurrentUser>
  /* Redetermine the users authentication state and update the state. */
  reauthenticate(): Promise<void>
  /* A reference to the client that you originall passed into the `AuthProvider` during initialization. */
  client: SupportedAuthClients
  type: SupportedAuthTypes
}

export const AuthContext = React.createContext<Partial<AuthContextInterface>>(
  {}
)

type AuthProviderProps = {
  client: SupportedAuthClients
  type: SupportedAuthTypes
  skipFetchCurrentUser?: boolean
}

type AuthProviderState = {
  loading: boolean
  isAuthenticated: boolean
  userMetadata: null | object
  currentUser: null | undefined | CurrentUser
}
/**
 * @example
 * ```js
 *  const client = new Auth0Client(options)
 *  // ...
 *  <AuthProvider client={client} type="auth0" skipFetchCurrentUser={true}>
 *    {children}
 *  </AuthProvider>
 * ```
 */
export class AuthProvider extends React.Component<
  AuthProviderProps,
  AuthProviderState
> {
  static defaultProps = {
    skipFetchCurrentUser: false,
  }

  state: AuthProviderState = {
    loading: true,
    isAuthenticated: false,
    userMetadata: null,
    currentUser: null,
  }

  rwClient: AuthClient

  constructor(props: AuthProviderProps) {
    super(props)
    this.rwClient = createAuthClient(props.client, props.type)
  }

  async componentDidMount() {
    await this.rwClient.restoreAuthState?.()
    return this.reauthenticate()
  }

  getCurrentUser = async () => {
    if (this.props.skipFetchCurrentUser) {
      return undefined
    }

    const token = await this.rwClient.getToken()

    try {
      const response = await window.fetch(
        `${window.__REDWOOD__API_PROXY_PATH}/graphql`,
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'auth-provider': this.rwClient.type,
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            query:
              'query __REDWOOD__AUTH_GET_CURRENT_USER { redwood { currentUser } }',
          }),
        }
      )

      if (response.ok) {
        const { data } = await response.json()
        return data?.redwood?.currentUser
      } else {
      }
    } catch (e) {
      e //?
    }
  }

  reauthenticate = async () => {
    const userMetadata = await this.rwClient.getUserMetadata()
    const isAuthenticated = userMetadata !== null

    let currentUser = null
    if (isAuthenticated) {
      // If we're unable to fetch the current user we should try again
      currentUser = await this.getCurrentUser()
    }

    this.setState({
      userMetadata,
      currentUser,
      isAuthenticated,
      loading: false,
    })
  }

  logIn = async (options?: any) => {
    await this.rwClient.login(options)
    return this.reauthenticate()
  }

  logOut = async (options?: any) => {
    await this.rwClient.logout(options)
    this.setState({
      userMetadata: null,
      currentUser: null,
      isAuthenticated: false,
    })
  }

  render() {
    const { client, type, children } = this.props

    return (
      <AuthContext.Provider
        value={{
          ...this.state,
          logIn: this.logIn,
          logOut: this.logOut,
          getToken: this.rwClient.getToken,
          getCurrentUser: this.getCurrentUser,
          reauthenticate: this.reauthenticate,
          client,
          type,
        }}
      >
        {children}
      </AuthContext.Provider>
    )
  }
}
