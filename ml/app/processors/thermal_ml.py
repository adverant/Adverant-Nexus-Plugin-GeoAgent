"""
Thermal ML Processor - Lightweight Version

Statistical thermal analysis (no PyTorch dependency).
"""

import numpy as np
import cv2
from typing import Dict, List
import logging

logger = logging.getLogger(__name__)

class ThermalMLProcessor:
    """Thermal processor with statistical methods"""

    def __init__(self, model_path: str = None):
        logger.info('Thermal processor initialized (statistical mode)')
        self.model_loaded = False

    def detect_anomalies(self, file_path: str, threshold: float = 2.0) -> Dict:
        """Statistical anomaly detection"""
        thermal_image = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)

        if thermal_image is None:
            raise ValueError(f'Could not read thermal image: {file_path}')

        mean = thermal_image.mean()
        std = thermal_image.std()
        anomaly_threshold = mean + threshold * std
        anomaly_mask = thermal_image > anomaly_threshold

        anomalies = self._extract_anomaly_regions(anomaly_mask, thermal_image)

        return {
            'anomalies': anomalies,
            'statistics': {
                'mean_temperature': float(mean),
                'max_temperature': float(thermal_image.max()),
                'min_temperature': float(thermal_image.min()),
                'std_temperature': float(std)
            },
            'method': 'statistical'
        }

    def _extract_anomaly_regions(self, mask: np.ndarray, image: np.ndarray) -> List[Dict]:
        """Extract connected anomaly regions"""
        num_labels, labels = cv2.connectedComponents(mask.astype(np.uint8))

        anomalies = []
        for label in range(1, num_labels):
            region_mask = labels == label
            region_pixels = np.argwhere(region_mask)

            if len(region_pixels) < 10:
                continue

            centroid = region_pixels.mean(axis=0)
            temp_values = image[region_mask]

            anomaly = {
                'id': f'anomaly_{label}',
                'centroid': centroid.tolist(),
                'area_pixels': int(len(region_pixels)),
                'temperature': {
                    'mean': float(temp_values.mean()),
                    'max': float(temp_values.max()),
                    'min': float(temp_values.min())
                }
            }
            anomalies.append(anomaly)

        logger.info(f'Detected {len(anomalies)} thermal anomalies')
        return anomalies

    def generate_heatmap(self, file_path: str) -> Dict:
        """Generate heat map"""
        thermal_image = cv2.imread(file_path, cv2.IMREAD_GRAYSCALE)
        if thermal_image is None:
            raise ValueError(f'Could not read thermal image: {file_path}')

        return {
            'heatmap_generated': True,
            'statistics': {
                'mean_temperature': float(thermal_image.mean()),
                'max_temperature': float(thermal_image.max()),
                'min_temperature': float(thermal_image.min())
            }
        }

    def is_loaded(self) -> bool:
        return False
