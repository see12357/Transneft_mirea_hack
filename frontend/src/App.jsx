import ChatInterface from './components/ChatInterface';
import './app.css'; // Импортируем app.css

function App() {
  return (
    <main className="bg-gray-100 w-full min-h-screen flex items-center justify-center font-sans">
      <div className="w-full max-w-4xl h-[90vh] max-h-[800px] flex rounded-lg shadow-2xl overflow-hidden">
        <div className="w-full bg-white flex flex-col">
          <ChatInterface />
        </div>
      </div>
    </main>
  );
}

export default App;