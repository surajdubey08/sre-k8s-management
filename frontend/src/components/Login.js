import React, { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../App';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { toast } from 'sonner';
import { Shield, Server, Lock, Eye, EyeOff } from 'lucide-react';

const Login = () => {
  const { user, login } = useAuth();
  const [credentials, setCredentials] = useState({ username: '', password: '' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (user) {
    return <Navigate to="/dashboard" />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(credentials);
    if (result.success) {
      toast.success('Welcome back! Connecting to cluster...');
    } else {
      setError(result.error);
      toast.error(result.error);
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background patterns */}
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(34,197,94,0.15)_1px,transparent_0)] bg-[size:24px_24px]"></div>
      
      {/* Animated background elements */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-emerald-500/5 rounded-full blur-3xl animate-pulse-slow"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl animate-pulse-slow" style={{ animationDelay: '1s' }}></div>
      
      <div className="relative z-10 w-full max-w-md space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center space-x-3">
            <div className="relative">
              <Shield className="h-12 w-12 text-emerald-400" />
              <div className="absolute inset-0 bg-emerald-400/20 rounded-full blur-xl"></div>
            </div>
            <div className="flex items-center space-x-1">
              <Server className="h-8 w-8 text-cyan-400" />
              <span className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                K8s Control
              </span>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-3xl font-bold text-white">SRE Dashboard</h2>
            <p className="text-slate-400">
              Secure access to your Kubernetes cluster management
            </p>
          </div>
        </div>

        {/* Login Form */}
        <Card className="glass-effect border-slate-700/50 shadow-2xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-xl text-white flex items-center space-x-2">
              <Lock className="h-5 w-5 text-emerald-400" />
              <span>Authentication Required</span>
            </CardTitle>
            <CardDescription className="text-slate-400">
              Enter your credentials to access the cluster management dashboard
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <Alert className="border-red-500/50 bg-red-500/10">
                  <AlertDescription className="text-red-400">
                    {error}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-slate-300 font-medium">
                    Username
                  </Label>
                  <Input
                    id="username"
                    name="username"
                    type="text"
                    required
                    value={credentials.username}
                    onChange={handleChange}
                    className="form-control"
                    placeholder="Enter your username"
                    disabled={loading}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-slate-300 font-medium">
                    Password
                  </Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      value={credentials.password}
                      onChange={handleChange}
                      className="form-control pr-10"
                      placeholder="Enter your password"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-300"
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full btn-primary h-11 text-base font-medium"
              >
                {loading ? (
                  <div className="flex items-center space-x-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Authenticating...</span>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <Shield className="h-4 w-4" />
                    <span>Secure Login</span>
                  </div>
                )}
              </Button>

              <div className="text-center space-y-4">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-slate-900 px-2 text-slate-500">or</span>
                  </div>
                </div>

                <p className="text-sm text-slate-400">
                  Need an account?{' '}
                  <Link 
                    to="/register" 
                    className="text-emerald-400 hover:text-emerald-300 transition-colors font-medium"
                  >
                    Request Access
                  </Link>
                </p>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* Demo credentials notice */}
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-6">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0">
                <div className="w-2 h-2 bg-yellow-400 rounded-full mt-2"></div>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-yellow-300">Demo Access</p>
                <p className="text-xs text-yellow-200/80">
                  Use <code className="bg-yellow-500/20 px-1 rounded text-yellow-300">admin / admin123</code> for administrative access
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security notice */}
        <div className="text-center text-xs text-slate-500 space-y-1">
          <p>🔒 All communications are encrypted and logged for security</p>
          <p>⚡ Connected to Kubernetes cluster management interface</p>
        </div>
      </div>
    </div>
  );
};

export default Login;