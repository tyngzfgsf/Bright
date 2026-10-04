import Link from 'next/link'

export default function LoginPage() { return <main className="login-page wrap"><Link href="/en" className="wordmark">Bright<span>.</span></Link><div className="login-box"><p className="section-label">Sign in</p><h1>Continue your practice.</h1><p>Google sign-in will be connected here. This is a placeholder for the Bright app.</p><button className="button dark-button" disabled>Sign in with Google</button><Link href="/en" className="back-link">Back to Bright</Link></div></main> }
