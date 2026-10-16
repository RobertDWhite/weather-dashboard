import unittest
from app.river_thresholds import flood_thresholds


class FloodThresholdTests(unittest.TestCase):
    def setUp(self):
        self.metadata = {"usgsId": "03245500", "lid": "MLGO1", "flood": {"stageUnits": "ft", "categories": {k: {"stage": v} for k, v in {"action": 13, "minor": 17, "moderate": 22, "major": 27}.items()}}}

    def test_station_thresholds_are_preserved(self):
        result = flood_thresholds(self.metadata, '03245500')
        self.assertEqual(result['minor'], 17)
        self.assertEqual(result['major'], 27)

    def test_wrong_station_or_unit_is_rejected(self):
        self.assertIsNone(flood_thresholds(self.metadata, 'other'))
        self.metadata['flood']['stageUnits'] = 'm'
        self.assertIsNone(flood_thresholds(self.metadata, '03245500'))

    def test_missing_and_invalid_thresholds_are_not_zero(self):
        self.metadata['flood']['categories']['major']['stage'] = -9999
        result = flood_thresholds(self.metadata, '03245500')
        self.assertNotIn('major', result)
        self.metadata['flood']['categories']['minor']['stage'] = 99
        self.assertIsNone(flood_thresholds(self.metadata, '03245500'))

    def test_negative_valid_stages_are_retained(self):
        self.metadata['flood']['categories']['action']['stage'] = -1
        self.assertEqual(flood_thresholds(self.metadata, '03245500')['action'], -1)

if __name__ == '__main__':
    unittest.main()
