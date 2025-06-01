import React from 'react';

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800 p-4">
      <div className="max-w-4xl mx-auto py-8">
        <h1 className="text-4xl font-bold text-center mb-4 bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">About DubTube</h1>
        <p className="text-center text-gray-600 dark:text-gray-300 mb-8">Revolutionizing video translation with AI-powered dubbing</p>

        {/* Mission Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Our Mission</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            At DubTube, we're on a mission to break down language barriers in video content. We believe that great content should be accessible to everyone, regardless of their native language. Our AI-powered platform makes it possible to translate and dub YouTube videos while maintaining perfect synchronization with the original content.
          </p>
        </section>

        {/* How It Works Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">How It Works</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-semibold mb-3">1. Video Processing</h3>
              <p className="text-gray-700 dark:text-gray-300">
                Our system extracts the audio from your YouTube video and processes it for translation.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-semibold mb-3">2. Transcription & Translation</h3>
              <p className="text-gray-700 dark:text-gray-300">
                We transcribe the audio, detect speakers, and translate the content to your target language.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-semibold mb-3">3. Voice Generation</h3>
              <p className="text-gray-700 dark:text-gray-300">
                Using advanced AI voice synthesis, we generate natural-sounding dubbed audio.
              </p>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
              <h3 className="text-xl font-semibold mb-3">4. Synchronization</h3>
              <p className="text-gray-700 dark:text-gray-300">
                The dubbed audio is perfectly synchronized with the original video for seamless viewing.
              </p>
            </div>
          </div>
        </section>

        {/* Technology Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Our Technology</h2>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
            <p className="text-gray-700 dark:text-gray-300 mb-4">
              DubTube leverages cutting-edge AI technologies to deliver high-quality translations and natural-sounding voiceovers:
            </p>
            <ul className="list-disc list-inside space-y-2 text-gray-700 dark:text-gray-300">
              <li>Advanced speech recognition for accurate transcription</li>
              <li>Speaker diarization to identify different speakers</li>
              <li>State-of-the-art translation models</li>
              <li>AI voice synthesis with natural intonation</li>
              <li>Precise audio-video synchronization</li>
            </ul>
          </div>
        </section>

        {/* Team Section */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">Our Team</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            We're a team of passionate developers, AI researchers, and language enthusiasts working together to make video content accessible to everyone. Our diverse backgrounds and expertise allow us to create innovative solutions for video translation and dubbing.
          </p>
        </section>

        {/* Contact Section */}
        <section>
          <h2 className="text-2xl font-bold mb-4">Get in Touch</h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            Have questions or suggestions? We'd love to hear from you! Reach out to us at:
          </p>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-6 shadow-lg">
            <p className="text-gray-700 dark:text-gray-300">
              Email: contact@dubtube.com
            </p>
          </div>
        </section>
      </div>
    </main>
  );
} 