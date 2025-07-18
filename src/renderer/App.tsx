import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Button,
  CssBaseline,
  Drawer,
  TextField,
  Typography,
  Paper,
  List,
  ListItem,
  ListItemButton,
  ListItemText,
  Divider,
} from '@mui/material';

const drawerWidth = 240;

interface Message {
  type: 'command' | 'response' | 'error';
  content: string;
}

interface Session {
  id: string;
  name: string;
  history: Message[];
}

export default function App() {
  const [command, setCommand] = useState('');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const conversationEndRef = useRef<null | HTMLDivElement>(null);

  const loadSessions = async () => {
    const loadedSessions = await window.electron.ipcRenderer.invoke('sessions:load-all');
    setSessions(loadedSessions);
  };

  useEffect(() => {
    loadSessions();
  }, []);

  useEffect(() => {
    const removeListener = window.electron.ipcRenderer.on(
      'gemini-response',
      (response: any) => {
        if (!activeSession) return;

        const newMessage: Message = {
          type: response.type === 'data' ? 'response' : 'error',
          content: response.content,
        };

        setActiveSession((prev) => {
          if (!prev) return null;
          const updatedSession = { ...prev, history: [...prev.history, newMessage] };
          window.electron.ipcRenderer.sendMessage('sessions:save', updatedSession);
          return updatedSession;
        });
      }
    );

    return () => {
      removeListener();
    };
  }, [activeSession]);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeSession?.history]);

  const handleSendCommand = () => {
    if (command.trim() && activeSession) {
      const newMessage: Message = { type: 'command', content: command };
      const updatedSession = { ...activeSession, history: [...activeSession.history, newMessage] };

      setActiveSession(updatedSession);
      window.electron.ipcRenderer.sendMessage('sessions:save', updatedSession);
      window.electron.ipcRenderer.sendMessage('gemini-command', { command, sessionId: activeSession.id });
      setCommand('');
    }
  };

  const handleCreateSession = async () => {
    const newSession = await window.electron.ipcRenderer.invoke('sessions:create');
    setSessions((prev) => [...prev, newSession]);
    setActiveSession(newSession);
  };

  const handleSelectSession = async (sessionId: string) => {
    const session = await window.electron.ipcRenderer.invoke('sessions:load-one', sessionId);
    setActiveSession(session);
  };

  return (
    <Box sx={{ display: 'flex' }}>
      <CssBaseline />
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: 'border-box' },
        }}
      >
        <Box sx={{ p: 2 }}>
          <Typography variant="h6" component="h2" gutterBottom>
            Sesiones
          </Typography>
          <Button variant="contained" fullWidth onClick={handleCreateSession}>
            Nueva Sesión
          </Button>
        </Box>
        <Divider />
        <List>
          {sessions.map((session) => (
            <ListItem key={session.id} disablePadding>
              <ListItemButton
                selected={activeSession?.id === session.id}
                onClick={() => handleSelectSession(session.id)}
              >
                <ListItemText primary={session.name} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: 3,
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
        }}
      >
        <Typography variant="h4" gutterBottom>
          {activeSession ? activeSession.name : 'Selecciona una sesión'}
        </Typography>
        <Paper
          elevation={2}
          sx={{
            flexGrow: 1,
            p: 2,
            overflowY: 'auto',
            mb: 2,
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {activeSession?.history.map((msg, index) => (
            <Box key={index} sx={{ mb: 2 }}>
              <Typography
                variant="body1"
                sx={{
                  fontWeight: msg.type === 'command' ? 'bold' : 'normal',
                  color: msg.type === 'error' ? 'red' : 'inherit',
                }}
              >
                {msg.type === 'command' ? `> ${msg.content}` : msg.content}
              </Typography>
            </Box>
          ))}
          <div ref={conversationEndRef} />
        </Paper>
        <Box sx={{ display: 'flex' }}>
          <TextField
            fullWidth
            variant="outlined"
            label="Escribe tu comando..."
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendCommand()}
            disabled={!activeSession}
          />
          <Button
            variant="contained"
            color="primary"
            onClick={handleSendCommand}
            sx={{ ml: 1, px: 4 }}
            disabled={!activeSession}
          >
            Enviar
          </Button>
        </Box>
      </Box>
    </Box>
  );
}
