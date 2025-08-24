import React from 'react';
import { Globe, Zap, Sparkles, Users, Mail, Play, Mic, Clock, Volume2 } from 'lucide-react';

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900 relative overflow-hidden">
      {/* Floating background blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-72 h-72 bg-gradient-to-r from-slate-200 to-slate-300 dark:from-slate-700 dark:to-slate-600 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute top-40 right-10 w-72 h-72 bg-gradient-to-r from-slate-300 to-slate-400 dark:from-slate-600 dark:to-slate-500 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
        <div className="absolute -bottom-8 left-20 w-72 h-72 bg-gradient-to-r from-slate-100 to-slate-200 dark:from-slate-800 dark:to-slate-700 rounded-full mix-blend-multiply filter blur-xl opacity-30 animate-blob"></div>
      </div>

      <div className="relative z-10 max-w-6xl mx-auto p-4 py-12">
        {/* Header */}
        <div className="text-center space-y-6 mb-16">
          <h1 className="text-5xl md:text-7xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent animate-gradient">
            About DubTube
          </h1>
          <p className="text-2xl md:text-3xl font-light text-slate-600 dark:text-slate-300 max-w-4xl mx-auto">
            Revolutionizing video translation with AI-powered dubbing
          </p>
        </div>

        {/* Mission Section */}
        <section className="mb-20">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <Globe className="w-8 h-8 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-6 text-slate-700 dark:text-slate-200">Our Mission</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 leading-relaxed text-center max-w-4xl mx-auto">
              At DubTube, we're on a mission to break down language barriers in video content. We believe that great content should be accessible to everyone, regardless of their native language. Our AI-powered platform makes it possible to translate and dub YouTube videos while maintaining perfect synchronization with the original content.
            </p>
          </div>
        </section>

        {/* How It Works Section */}
        <section className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-4xl md:text-5xl font-bold bg-gradient-to-r from-slate-700 via-slate-600 to-slate-500 dark:from-slate-200 dark:via-slate-300 dark:to-slate-400 bg-clip-text text-transparent">
              How It Works
            </h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                  <Play className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-center text-slate-700 dark:text-slate-200">1. Video Processing</h3>
              <p className="text-slate-600 dark:text-slate-300 text-center">
                Our system extracts the audio from your YouTube video and processes it for translation.
              </p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                  <Mic className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-center text-slate-700 dark:text-slate-200">2. Transcription & Translation</h3>
              <p className="text-slate-600 dark:text-slate-300 text-center">
                We transcribe the audio, detect speakers, and translate the content to your target language.
              </p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                  <Sparkles className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-center text-slate-700 dark:text-slate-200">3. Voice Generation</h3>
              <p className="text-slate-600 dark:text-slate-300 text-center">
                Using advanced AI voice synthesis, we generate natural-sounding dubbed audio.
              </p>
            </div>
            <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-lg hover:shadow-xl transition-all duration-300 transform hover:scale-105">
              <div className="flex justify-center mb-4">
                <div className="p-3 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                  <Clock className="w-8 h-8 text-slate-600 dark:text-slate-300" />
                </div>
              </div>
              <h3 className="text-xl font-semibold mb-3 text-center text-slate-700 dark:text-slate-200">4. Synchronization</h3>
              <p className="text-slate-600 dark:text-slate-300 text-center">
                The dubbed audio is perfectly synchronized with the original video for seamless viewing.
              </p>
            </div>
          </div>
        </section>

        {/* Technology Section */}
        <section className="mb-20">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <Zap className="w-8 h-8 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-6 text-slate-700 dark:text-slate-200">Our Technology</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 text-center max-w-4xl mx-auto">
              DubTube leverages cutting-edge AI technologies to deliver high-quality translations and natural-sounding voiceovers:
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-4xl mx-auto">
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">Advanced speech recognition</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">Speaker diarization</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">State-of-the-art translation</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">AI voice synthesis</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">Natural intonation</span>
              </div>
              <div className="flex items-center space-x-3 p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-slate-700 dark:text-slate-200">Precise synchronization</span>
              </div>
            </div>
          </div>
        </section>

        {/* Team Section */}
        <section className="mb-20">
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <Users className="w-8 h-8 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-6 text-slate-700 dark:text-slate-200">Our Team</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 text-center max-w-4xl mx-auto leading-relaxed">
              We're a team of passionate developers, AI researchers, and language enthusiasts working together to make video content accessible to everyone. Our diverse backgrounds and expertise allow us to create innovative solutions for video translation and dubbing.
            </p>
          </div>
        </section>

        {/* Contact Section */}
        <section>
          <div className="bg-white/50 dark:bg-slate-800/50 backdrop-blur-sm rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-xl">
            <div className="flex items-center justify-center mb-6">
              <div className="p-4 bg-slate-100 dark:bg-slate-700 rounded-2xl">
                <Mail className="w-8 h-8 text-slate-600 dark:text-slate-300" />
              </div>
            </div>
            <h2 className="text-3xl md:text-4xl font-bold text-center mb-6 text-slate-700 dark:text-slate-200">Get in Touch</h2>
            <p className="text-lg text-slate-600 dark:text-slate-300 mb-6 text-center max-w-2xl mx-auto">
              Have questions or suggestions? We'd love to hear from you! Reach out to us at:
            </p>
            <div className="text-center">
              <a 
                href="mailto:contact@dubtube.com" 
                className="inline-flex items-center space-x-3 bg-gradient-to-r from-slate-700 to-slate-600 dark:from-slate-600 dark:to-slate-500 text-white px-8 py-4 rounded-2xl font-semibold hover:from-slate-800 hover:to-slate-700 dark:hover:from-slate-500 dark:hover:to-slate-400 transition-all duration-300 transform hover:scale-105 shadow-lg hover:shadow-xl"
              >
                <Mail className="w-5 h-5" />
                <span>contact@dubtube.com</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
} 