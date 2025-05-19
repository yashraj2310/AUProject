import { useEffect } from 'react'; 
import './App.css';
import { Topbar, Loader } from './components/component';
import { Outlet, ScrollRestoration } from 'react-router-dom';
import { authService } from './services/Auth.service';
import { useDispatch, useSelector } from 'react-redux'; 
import { setUserSession } from './features/authSlice'; 

function App() {
  const dispatch = useDispatch();

  const loadingAuth = useSelector((state) => state.auth.loadingAuth);

  useEffect(() => {
    const verifyUserOnLoad = async () => {
    
      try {

        const userDataFromVerification = await authService.verifyLogin();
        dispatch(setUserSession({ userData: userDataFromVerification }));

      } catch (error) {
        console.info("App.jsx: Session verification failed or no active session.", error.message);
       
        dispatch(setUserSession({ userData: null }));
      }
     
    };

    verifyUserOnLoad();
  }, [dispatch]); 

  if (loadingAuth) { 
    return (
      <Loader
        message="Initializing Cohort..."
        containerHeight="h-screen"
        className="bg-gray-900"
      />
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-900 text-gray-100">
      <ScrollRestoration />
      <Topbar /> {/* Topbar can now use useSelector(state => state.auth) to get auth status */}
      <main className="flex-grow">
        <Outlet /> {/* Routed components like ProblemDetail will render here */}
      </main>
     
    </div>
  );
}

export default App;