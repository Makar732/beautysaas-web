import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Sparkles } from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function AuthCallbackPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        navigate('/login', { replace: true });
        return;
      }

      // AuthContext обработает needsOnboarding
      setTimeout(() => navigate('/login', { replace: true }), 800);
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center">
      <div className="text-center">
        <div className="flex justify-center mb-6">
          <Sparkles className="text-amber-400" size={42} />
        </div>
        <Loader2 size={48} className="animate-spin text-emerald-400 mx-auto mb-6" />
        <p className="text-xl font-semibold text-white">Завершаем вход через Яндекс...</p>
        <p className="text-gray-400 mt-2">Это займёт пару секунд</p>
      </div>
    </div>
  );
}