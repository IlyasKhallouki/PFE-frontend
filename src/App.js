import { Routes, Route } from 'react-router-dom';
import SignIn from './pages/SignIn';
import EnhancedChatApp from './pages/Home';

function App() {
  return (
    <Routes>
      <Route path="/signin" element={<SignIn />} />
      <Route path="/home" element={<EnhancedChatApp />} />
    </Routes>
  );
}

export default App;