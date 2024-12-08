"use client"
import { HelmetProvider } from 'react-helmet-async';

const HelmetWrapper = ({ children }: {
    children: React.ReactNode
}) => {
    return (
        <HelmetProvider>
            {children}
        </HelmetProvider>
    );
};

export default HelmetWrapper;