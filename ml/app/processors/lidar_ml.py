"""
LiDAR ML Processor - Lightweight Version

Rule-based point cloud classification (no PyTorch dependency).
Classifies LiDAR points using geometric and statistical methods.
"""

import numpy as np
from typing import Dict, List
import laspy
import logging

logger = logging.getLogger(__name__)

# Classification categories (LAS standard)
CLASSIFICATION_CLASSES = {
    0: 'unclassified',
    1: 'ground',
    2: 'low_vegetation',
    3: 'medium_vegetation',
    4: 'high_vegetation',
    5: 'building',
    6: 'water',
    7: 'other'
}

class LiDARMLProcessor:
    """LiDAR point cloud processor with rule-based classification"""

    def __init__(self, model_path: str = None):
        logger.info('LiDAR processor initialized (rule-based mode)')
        self.model_loaded = False

    def classify_points(self, file_path: str) -> Dict:
        """Classify LiDAR points using rule-based methods"""
        logger.info(f'Classifying LiDAR points from {file_path}')

        try:
            # Read LAS file
            las = laspy.read(file_path)
            points = np.vstack((las.x, las.y, las.z)).transpose()

            logger.info(f'Loaded {len(points)} points')

            # Rule-based classification
            classifications = self._classify_rule_based(points)

            # Extract features
            results = self._extract_features(points, classifications)

            logger.info(f'Classification complete')
            return results

        except Exception as e:
            logger.error(f'Classification failed: {e}')
            raise

    def _classify_rule_based(self, points: np.ndarray) -> np.ndarray:
        """
        Rule-based classification using height and geometry
        """
        logger.info('Using rule-based classification')

        classifications = np.zeros(len(points), dtype=np.int32)

        # Simple height-based classification
        z_min = points[:, 2].min()
        z_max = points[:, 2].max()
        z_range = z_max - z_min

        if z_range > 0:
            # Ground: lowest 10% of points
            ground_threshold = z_min + 0.1 * z_range
            classifications[points[:, 2] < ground_threshold] = 1

            # Low vegetation: 10-30% height
            low_veg_threshold = z_min + 0.3 * z_range
            mask = (points[:, 2] >= ground_threshold) & (points[:, 2] < low_veg_threshold)
            classifications[mask] = 2

            # Medium vegetation: 30-60% height
            med_veg_threshold = z_min + 0.6 * z_range
            mask = (points[:, 2] >= low_veg_threshold) & (points[:, 2] < med_veg_threshold)
            classifications[mask] = 3

            # High vegetation/buildings: >60% height
            mask = points[:, 2] >= med_veg_threshold
            classifications[mask] = 4

        return classifications

    def _extract_features(self, points: np.ndarray, classifications: np.ndarray) -> Dict:
        """Extract features from classified point cloud"""

        # Calculate bounds
        bounds = {
            'minX': float(points[:, 0].min()),
            'maxX': float(points[:, 0].max()),
            'minY': float(points[:, 1].min()),
            'maxY': float(points[:, 1].max()),
            'minZ': float(points[:, 2].min()),
            'maxZ': float(points[:, 2].max())
        }

        # Classification statistics
        unique, counts = np.unique(classifications, return_counts=True)
        class_stats = {
            CLASSIFICATION_CLASSES.get(int(cls), 'unknown'): int(count)
            for cls, count in zip(unique, counts)
        }

        # Extract buildings using DBSCAN clustering
        buildings = self._extract_buildings(points, classifications)

        # Extract vegetation statistics
        vegetation = self._extract_vegetation(points, classifications)

        return {
            'numPoints': len(points),
            'bounds': bounds,
            'classifications': class_stats,
            'buildings': buildings,
            'vegetation': vegetation,
            'statistics': {
                'total_points': len(points),
                'classified_points': len(points),
                'classification_method': 'rule-based'
            }
        }

    def _extract_buildings(self, points: np.ndarray, classifications: np.ndarray) -> List[Dict]:
        """Extract building footprints using clustering"""
        from sklearn.cluster import DBSCAN

        # Get building points (class 5 or high vegetation class 4)
        building_mask = np.isin(classifications, [4, 5])
        building_points = points[building_mask]

        if len(building_points) < 50:
            return []

        # Cluster building points (2D)
        clustering = DBSCAN(eps=2.0, min_samples=50).fit(building_points[:, :2])

        buildings = []
        for label in set(clustering.labels_):
            if label == -1:
                continue

            cluster_points = building_points[clustering.labels_ == label]

            # Calculate building properties
            from scipy.spatial import ConvexHull
            try:
                hull = ConvexHull(cluster_points[:, :2])
                area = float(hull.volume)
            except:
                area = 0.0

            building = {
                'id': f'building_{label}',
                'centroid': cluster_points.mean(axis=0).tolist(),
                'height': float(cluster_points[:, 2].max() - cluster_points[:, 2].min()),
                'area': area,
                'point_count': len(cluster_points)
            }
            buildings.append(building)

        logger.info(f'Extracted {len(buildings)} buildings')
        return buildings

    def _extract_vegetation(self, points: np.ndarray, classifications: np.ndarray) -> Dict:
        """Extract vegetation statistics"""
        veg_classes = [2, 3, 4]  # low, medium, high vegetation
        veg_mask = np.isin(classifications, veg_classes)
        veg_points = points[veg_mask]

        if len(veg_points) == 0:
            return {
                'point_count': 0,
                'height_stats': {'mean': 0, 'max': 0, 'min': 0}
            }

        return {
            'point_count': int(len(veg_points)),
            'height_stats': {
                'mean': float(veg_points[:, 2].mean()),
                'max': float(veg_points[:, 2].max()),
                'min': float(veg_points[:, 2].min()),
                'std': float(veg_points[:, 2].std())
            },
            'coverage_percentage': float(len(veg_points) / len(points) * 100)
        }

    def is_loaded(self) -> bool:
        """Check if ML model is loaded (always False for rule-based)"""
        return False
