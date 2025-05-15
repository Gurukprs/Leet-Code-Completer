import React, { useState, useRef } from 'react';

function App() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [maxCount, setMaxCount] = useState(10);
  const [selectedLevels, setSelectedLevels] = useState(['medium', 'hard']);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [status, setStatus] = useState('');
  const ws = useRef(null);

  const handleLevelChange = (level) => {
    setSelectedLevels((prev) =>
      prev.includes(level)
        ? prev.filter((l) => l !== level)
        : [...prev, level]
    );
  };

  const startSubmission = () => {
    if (!username || !password) {
      alert('Please enter your LeetCode credentials.');
      return;
    }

    ws.current = new WebSocket('ws://localhost:3001');

    ws.current.onopen = () => {
      ws.current.send(
        JSON.stringify({ username, password, maxCount, selectedLevels })
      );
      setStatus('Started submission...');
    };

    ws.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'progress') {
        setProgress({ completed: message.completed, total: message.total });
        setStatus(`Submitted: ${message.title}`);
      } else if (message.type === 'done') {
        setStatus(`All submissions completed: ${message.completed}`);
        ws.current.close();
      } else if (message.type === 'error') {
        setStatus(`Error: ${message.error}`);
      }
    };

    ws.current.onerror = (error) => {
      setStatus('WebSocket error');
      console.error('WebSocket error:', error);
    };
  };

  return (
    <div style={{ padding: '2rem', fontFamily: 'Arial' }}>
      <h1>LeetCode Auto Submitter</h1>
      <div>
        <label>
          LeetCode Username:
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            style={{ marginLeft: '1rem' }}
          />
        </label>
      </div>
      <div>
        <label>
          LeetCode Password:
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ marginLeft: '1rem' }}
          />
        </label>
      </div>
      <div>
        <label>
          Number of Problems to Solve:
          <input
            type="number"
            value={maxCount}
            onChange={(e) => setMaxCount(Number(e.target.value))}
            style={{ marginLeft: '1rem' }}
          />
        </label>
      </div>
      <div>
        <label>
          <input
            type="checkbox"
            checked={selectedLevels.includes('easy')}
            onChange={() => handleLevelChange('easy')}
          />
          Easy
        </label>
        <label style={{ marginLeft: '1rem' }}>
          <input
            type="checkbox"
            checked={selectedLevels.includes('medium')}
            onChange={() => handleLevelChange('medium')}
          />
          Medium
        </label>
        <label style={{ marginLeft: '1rem' }}>
          <input
            type="checkbox"
            checked={selectedLevels.includes('hard')}
            onChange={() => handleLevelChange('hard')}
          />
          Hard
        </label>
      </div>
      <button onClick={startSubmission} style={{ marginTop: '1rem' }}>
        Start Submission
      </button>
      <div style={{ marginTop: '1rem' }}>
        <strong>Status:</strong> {status}
      </div>
      <div>
        <strong>Progress:</strong> {progress.completed} / {progress.total}
      </div>
    </div>
  );
}

export default App;
