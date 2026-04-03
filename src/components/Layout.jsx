import Sidebar from './Sidebar'
import TopNav from './TopNav'

export default function Layout({ children, currentUser, onLogout }) {
  return (
    <>
      <Sidebar currentUser={currentUser} />
      <TopNav currentUser={currentUser} onLogout={onLogout} />
      <main className="main-content">
        {children}
      </main>
    </>
  )
}
