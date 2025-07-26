import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { AvailableTargets } from '../types';

interface TargetSelectorProps {
  isVisible: boolean;
  probeIndex: number;
  onTargetSelected: (targetName: string) => void;
  onCancel: () => void;
}

export default function TargetSelector({ isVisible, probeIndex, onTargetSelected, onCancel }: TargetSelectorProps) {
  const [availableTargets, setAvailableTargets] = useState<AvailableTargets | null>(null);
  const [selectedFamily, setSelectedFamily] = useState<string>('');
  const [selectedTarget, setSelectedTarget] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  useEffect(() => {
    if (isVisible) {
      fetchAvailableTargets();
    }
  }, [isVisible]);

  const fetchAvailableTargets = async () => {
    setIsLoading(true);
    try {
      const targets = await invoke<AvailableTargets>('get_available_targets');
      setAvailableTargets(targets);
      
      // Auto-select STM32H7 family if available
      const stm32h7Family = targets.families.find(f => f.name.includes('STM32H7'));
      if (stm32h7Family) {
        setSelectedFamily(stm32h7Family.name);
        // Auto-select STM32H735ZGTx if available
        if (stm32h7Family.variants.includes('STM32H735ZGTx')) {
          setSelectedTarget('STM32H735ZGTx');
        }
      }
    } catch (error) {
      console.error('Failed to fetch available targets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnect = async () => {
    if (!selectedTarget) return;
    
    setIsConnecting(true);
    try {
      const sessionInfo = await invoke('connect_to_specific_target', {
        probeIndex,
        targetName: selectedTarget
      });
      console.log('Successfully connected to target:', selectedTarget, sessionInfo);
      onTargetSelected(selectedTarget);
    } catch (error) {
      console.error('Failed to connect to target:', error);
      alert(`Failed to connect to ${selectedTarget}: ${error}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const getVariantsForFamily = (familyName: string): string[] => {
    const family = availableTargets?.families.find(f => f.name === familyName);
    return family?.variants || [];
  };

  const getRecommendedTargets = (): string[] => {
    return availableTargets?.recommended_stm32h7 || [];
  };

  if (!isVisible) return null;

  return (
    <div className="target-selector-overlay">
      <div className="target-selector-dialog">
        <div className="target-selector-header">
          <h3>Select Target MCU</h3>
          <button onClick={onCancel} className="close-button">✕</button>
        </div>

        <div className="target-selector-content">
          {isLoading ? (
            <div className="loading">Loading available targets...</div>
          ) : (
            <>
              <div className="recommended-section">
                <h4>🚀 Recommended STM32H7 Targets</h4>
                <div className="recommended-targets">
                  {getRecommendedTargets().map(target => (
                    <button
                      key={target}
                      className={`target-chip ${selectedTarget === target ? 'selected' : ''}`}
                      onClick={() => setSelectedTarget(target)}
                    >
                      {target}
                    </button>
                  ))}
                </div>
              </div>

              <div className="family-selection">
                <h4>📦 All Chip Families</h4>
                <div className="selection-row">
                  <div className="family-column">
                    <label>Chip Family:</label>
                    <select 
                      value={selectedFamily} 
                      onChange={(e) => {
                        setSelectedFamily(e.target.value);
                        setSelectedTarget(''); // Reset target when family changes
                      }}
                    >
                      <option value="">Select a family...</option>
                      {availableTargets?.families.map(family => (
                        <option key={family.name} value={family.name}>
                          {family.name} ({family.variants.length} variants)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="variant-column">
                    <label>Target Variant:</label>
                    <select 
                      value={selectedTarget} 
                      onChange={(e) => setSelectedTarget(e.target.value)}
                      disabled={!selectedFamily}
                    >
                      <option value="">Select a target...</option>
                      {getVariantsForFamily(selectedFamily).map(variant => (
                        <option key={variant} value={variant}>
                          {variant}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="target-info">
                {selectedTarget && (
                  <div className="selected-target-info">
                    <strong>Selected Target:</strong> {selectedTarget}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="target-selector-actions">
          <button onClick={onCancel} className="cancel-button">
            Cancel
          </button>
          <button 
            onClick={handleConnect} 
            disabled={!selectedTarget || isConnecting}
            className="connect-button"
          >
            {isConnecting ? 'Connecting...' : 'Connect'}
          </button>
        </div>
      </div>
    </div>
  );
}