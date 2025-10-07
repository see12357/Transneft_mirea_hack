import ChatInterface from './components/ChatInterface';
import './app.css';
import { CssBaseline, ThemeProvider, createTheme, Box, useMediaQuery } from '@mui/material';
import { blue, red } from '@mui/material/colors';
import React from 'react';

function useAppTheme() {
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const [mode, setMode] = React.useState(prefersDark ? 'dark' : 'light');

  const toggleColorMode = React.useCallback(() => {
    setMode(prev => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const theme = React.useMemo(() => createTheme({
    palette: {
      mode,
      primary: {
        main: blue[600]
      },
      secondary: {
        main: red[600]
      }
    },
    typography: {
      fontFamily: '"Inter", "Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
      h6: {
        fontWeight: 600,
        letterSpacing: '-0.01em'
      },
      body1: {
        fontWeight: 400,
        lineHeight: 1.6
      },
      body2: {
        fontWeight: 400,
        lineHeight: 1.5
      }
    },
    shape: { borderRadius: 16 },
    components: {
      MuiPaper: {
        styleOverrides: {
          root: {
            backgroundImage: 'none'
          }
        }
      }
    }
  }), [mode]);

  return { theme, mode, toggleColorMode };
}

function App() {
  const { theme, mode, toggleColorMode } = useAppTheme();
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box sx={{ bgcolor: 'background.default', minHeight: '100vh' }}>
        <ChatInterface mode={mode} toggleColorMode={toggleColorMode} />
      </Box>
    </ThemeProvider>
  );
}

export default App;